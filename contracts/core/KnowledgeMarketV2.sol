// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4908} from "erc-4908/contracts/ERC4908.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title KnowledgeMarket
 * @dev Contract for managing knowledge subscriptions using ERC4908 token standard
 */
contract KnowledgeMarketV2 is Initializable, ERC4908, ReentrancyGuard {
    // Default image URL used when no image is provided
    string private constant DEFAULT_IMAGE_URL = "https://arweave.net/9u0cgTmkSM25PfQpGZ-JzspjOMf4uGFjkvOfKjgQnVY";

    struct Subscription {
        string vaultId;
        string imageURL;
    }

    struct Deal {
        address vaultOwner;
        string imageURL;
        uint256 price;
    }

    address payable public platformTreasury;
    uint32 public platformFeePercent; // ex: 500 = 5%
    uint256 private nextTokenId = 0;

    // Vault ID string cannot be empty
    error EmptyVaultId();
    // Zero address cannot be used for vault owner or recipient
    error ZeroAddress();
    // Split fee must be between 0 and 10000 (inclusive)
    error SameCoOwner();
    // Fee must be between 0 and 10000 (inclusive)
    error InvalidFee();

    // Maps vault owner addresses to their subscription offerings
    mapping(address => Subscription[]) public vaultOwnerSubscriptions;
    // Maps NFT IDs to their deal information
    mapping(uint256 => Deal) public dealInfo;
    // Maps image URLs to their corresponding NFT metadata
    mapping(address => mapping(string => string)) private subscriptionImageURLs;

    // Events for important state changes
    event SubscriptionCreated(address indexed vaultOwner, string vaultId, uint256 price, uint32 expirationDuration);
    event SubscriptionDeleted(address indexed vaultOwner, string vaultId);
    event AccessGranted(address indexed vaultOwner, string vaultId, address indexed customer, uint256 tokenId, uint256 price);

    constructor() ERC4908("Knowledge Market Access", "KMA") {}

    function initialize(address payable _treasury, uint32 _fee) public initializer {
        if (_treasury == address(0)) revert ZeroAddress();
        if (_fee > 10000) revert InvalidFee();

        platformTreasury = _treasury;
        platformFeePercent = _fee;
    }

    /**
     * @dev Creates a new subscription offering
     * @param vaultId Unique identifier for the knowledge vault
     * @param price Cost to mint an access NFT (can be 0 for free NFTs)
     * @param expirationDuration How long access lasts (in seconds)
     * @param imageURL URL for the image representing this subscription
     */
    function setSubscription(
        string calldata vaultId,
        uint256 price,
        uint32 expirationDuration,
        string calldata imageURL,
        address coOwner,
        uint32 splitFee
    ) public nonReentrant {
        // Input validation
        if (bytes(vaultId).length == 0) revert EmptyVaultId();
        if (splitFee > 10000) revert InvalidFee();
        if (coOwner == msg.sender) revert SameCoOwner();

        // Use the default image if none provided
        string memory finalImageURL = bytes(imageURL).length == 0 ? DEFAULT_IMAGE_URL : imageURL;
        
        vaultOwnerSubscriptions[msg.sender].push(Subscription(vaultId, finalImageURL));
        subscriptionImageURLs[msg.sender][vaultId] = finalImageURL;

        setAccess(vaultId, price, expirationDuration, coOwner, splitFee);

        emit SubscriptionCreated(msg.sender, vaultId, price, expirationDuration);
    }

    /**
     * @dev Deletes an existing subscription offering
     * @param vaultId Unique identifier for the knowledge vault to delete
     */
    function deleteSubscription(string calldata vaultId) public nonReentrant {
        if (bytes(vaultId).length == 0) revert EmptyVaultId();
        
        Subscription[] storage subscriptions = vaultOwnerSubscriptions[msg.sender];
        uint256 length = subscriptions.length;
        bool found = false;

        for (uint256 i = 0; i < length; i++) {
            if (keccak256(abi.encodePacked(subscriptions[i].vaultId)) 
                    == keccak256(abi.encodePacked(vaultId))) {
                // More gas efficient swap-and-pop
                subscriptions[i] = subscriptions[length - 1];
                subscriptions.pop();
                found = true;
                break;
            }
        }

        if (found) {
            delete subscriptionImageURLs[msg.sender][vaultId];
            delAccess(vaultId);
            emit SubscriptionDeleted(msg.sender, vaultId);
        }
    }

    struct SubscriptionDetails {
        string vaultId;
        string imageURL;
        uint256 price;
        uint32 expirationDuration;
        address coOwner;
        uint32 splitFee;
    }

    /**
     * @dev Gets all subscription offerings for a vault owner
     * @param vaultOwner Address of the vault owner
     * @return Array of subscription details
     */
    function getVaultOwnerSubscriptions(address vaultOwner) public view returns (SubscriptionDetails[] memory) {
        if (vaultOwner == address(0)) revert ZeroAddress();
        
        uint256 length = vaultOwnerSubscriptions[vaultOwner].length;
        SubscriptionDetails[] memory subs = new SubscriptionDetails[](length);

        for (uint256 i = 0; i < length; i++) {
            (uint256 price, uint32 expirationDuration, address coOwner, uint32 splitFee) = this.getAccessControl(
                vaultOwner, 
                vaultOwnerSubscriptions[vaultOwner][i].vaultId
            );

            subs[i] = SubscriptionDetails(
                vaultOwnerSubscriptions[vaultOwner][i].vaultId,
                vaultOwnerSubscriptions[vaultOwner][i].imageURL,
                price,
                expirationDuration,
                coOwner,
                splitFee
            );
        }

        return subs;
    }

    /**
     * @dev Mints an access NFT for a specific vault
     * @param vaultOwner Address receiving the payment
     * @param vaultId Unique identifier for the knowledge vault
     * @param to Address receiving the access NFT
     */
    function mint(
        address payable vaultOwner,
        string calldata vaultId,
        address to
    ) public payable nonReentrant {
        if (vaultOwner == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (bytes(vaultId).length == 0) revert EmptyVaultId();

        bytes32 hash = _hash(vaultOwner, vaultId);
        if (!this.existAccess(hash)) revert MintUnavailable(hash);
        
        Settings memory set = accessControl[hash];

        if (msg.value < set.price) revert InsufficientFunds(set.price);

        uint256 tokenId = nextTokenId++;
        nftData[tokenId] = Metadata(
            hash,
            set.resourceId,
            set.expirationDuration + uint32(block.timestamp)
        );

        string memory imageURL = subscriptionImageURLs[vaultOwner][vaultId];
        if (bytes(imageURL).length == 0) {
            imageURL = DEFAULT_IMAGE_URL;
        }

        dealInfo[tokenId] = Deal(vaultOwner, imageURL, set.price);

        _processPayment(vaultOwner, set.price, set);

        uint256 excess = msg.value - set.price;
        if (excess > 0) {
            (bool sent, ) = payable(msg.sender).call{value: excess}("");
            require(sent, "Refund failed");
        }
        // Mint the NFT
        _safeMint(to, tokenId);

        emit AccessGranted(vaultOwner, vaultId, to, tokenId, set.price);
    }

    function _processPayment(
        address payable vaultOwner,
        uint256 amount,
        Settings memory set
    ) private {
        uint256 remaining = amount;
        uint256 feeAmount = (amount * platformFeePercent) / 10000;
        if (feeAmount > 0) {
            (bool sentFee, ) = platformTreasury.call{value: feeAmount}("");
            require(sentFee, "Failed to send platform fee");
            remaining -= feeAmount;
        }
        if (set.coOwner != address(0) && set.splitFee > 0) {
            uint256 coPart = (remaining * set.splitFee) / 10000;
            remaining -= coPart;
            (bool sentCo, ) = payable(set.coOwner).call{value: coPart}("");
            require(sentCo, "Failed to send co-owner fee");
        }
        if (remaining > 0) {
            (bool sentVault, ) = vaultOwner.call{value: remaining}("");
            require(sentVault, "Failed to send vault owner payment");
        }
    }
    
    /**
     * @dev Checks if a customer has access to any of a vault owner's resources
     * @param vaultOwner Address of the vault owner
     * @param customer Address to check access for
     * @return True if customer has access to any resource
     */
    function hasAccess(
        address vaultOwner,
        address customer
    )
        public
        view
        returns (bool)
    {
        if (vaultOwner == address(0) || customer == address(0)) return false;
        
        uint256 length = vaultOwnerSubscriptions[vaultOwner].length;
        for (uint256 i = 0; i < length; i++) {
            (bool response,,) = this.hasAccess(vaultOwner, vaultOwnerSubscriptions[vaultOwner][i].vaultId, customer);
            if (response) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Returns the token URI for an NFT
     * @param id Token ID
     * @return JSON metadata as a string
     */
    function tokenURI(uint256 id) public view override returns (string memory) {
        Metadata memory data = nftData[id];
        Deal memory deal = dealInfo[id];
        Settings memory set = accessControl[data.hash];

        string memory imageUrl = bytes(deal.imageURL).length > 0
            ? deal.imageURL
            : DEFAULT_IMAGE_URL;

        string memory json = string.concat(
            "{",
                "\"name\":\"", data.resourceId, "\",",
                "\"description\":\"This NFT grants access to a knowledge vault.\",",
                "\"external_url\":\"https://knowledge-market.io/vaults/", data.resourceId, "\",",
                "\"image\":\"", imageUrl, "\",",
                "\"attributes\":[",
                    "{ \"trait_type\": \"Price\", \"value\": ", Strings.toString(deal.price), " },",
                    "{ \"trait_type\": \"Platform Fee (%)\", \"value\": ", Strings.toString(platformFeePercent), " },",
                    "{ \"trait_type\": \"Split Fee (%)\", \"value\": ", Strings.toString(set.splitFee), " },",
                    "{ \"trait_type\": \"Expiration date\", \"display_type\": \"date\", \"value\": ", Strings.toString(data.expirationTime), " }",
                "]",
            "}"
        );

        return string.concat("data:application/json;utf8,", json);
    }
} 