// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4908} from "erc-4908/contracts/ERC4908.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title KnowledgeMarket
 * @dev Contract for managing knowledge subscriptions using ERC4908 token standard
 */
contract KnowledgeMarket is ERC4908, ReentrancyGuard {
    // Default image URL used when no image is provided
    string private constant DEFAULT_IMAGE_URL = "https://arweave.net/9u0cgTmkSM25PfQpGZ-JzspjOMf4uGFjkvOfKjgQnVY";
    uint32 public PLATFORM_FEE = 1200;
    address payable public platformTreasury;

    struct Subscription {
        string vaultId;
        string imageURL;
    }

    struct Deal {
        address vaultOwner;
        string imageURL;
        uint256 price;
    }

    // Vault ID string cannot be empty
    error EmptyVaultId();
    // Zero address cannot be used for vault owner or recipient
    error ZeroAddress();
    // Duration cannot be zero
    error ZeroDuration();
    // Split fee must be between 0 and 10000 (inclusive)
    error InvalidSplitFee();
    // Owner and co-owner cannot be the same address
    error SameOwnerAndCoOwner();

    // Maps vault owner addresses to their subscription offerings
    mapping(address => Subscription[]) public vaultOwnerSubscriptions;
    // Maps NFT IDs to their deal information
    mapping(uint256 => Deal) public dealInfo;

    // Events for important state changes
    event SubscriptionCreated(address indexed vaultOwner, string vaultId, uint256 price, uint32 expirationDuration);
    event SubscriptionDeleted(address indexed vaultOwner, string vaultId);
    event AccessGranted(address indexed vaultOwner, string vaultId, address indexed customer, uint256 tokenId, uint256 price);

    constructor(address payable initialTreasury) ERC4908("Knowledge Market Access", "KMA") {
        if (initialTreasury == address(0)) revert ZeroAddress();
        platformTreasury = initialTreasury;
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
        if (expirationDuration == 0) revert ZeroDuration();
        if (splitFee > 10000) revert InvalidSplitFee();
        if (coOwner == msg.sender) revert SameOwnerAndCoOwner();

        // Use the default image if none provided
        string memory finalImageURL = bytes(imageURL).length == 0 ? DEFAULT_IMAGE_URL : imageURL;
        
        vaultOwnerSubscriptions[msg.sender].push(Subscription(vaultId, finalImageURL));
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
    ) public payable override nonReentrant {
        if (vaultOwner == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (bytes(vaultId).length == 0) revert EmptyVaultId();

        (uint256 basePrice, , address coOwner, uint32 splitFee) = this.getAccessControl(vaultOwner, vaultId);
        
        if (msg.value < basePrice) revert InsufficientFunds(basePrice);

        uint256 platformFee = (basePrice * PLATFORM_FEE) / 10000;
        uint256 creatorAmount = basePrice - platformFee;
        
        // Send platform fee to the treasury
        platformTreasury.transfer(platformFee);

        // If co-owner exists, split the payment
        if (coOwner != address(0) && splitFee > 0) {
            uint256 coOwnerAmount = (creatorAmount * splitFee) / 10000;
            uint256 ownerAmount = creatorAmount - coOwnerAmount;
            payable(coOwner).transfer(coOwnerAmount);
            vaultOwner.transfer(ownerAmount);
        } else {
            vaultOwner.transfer(creatorAmount);
        }

        // This will validate that the sent value matches the required price (which can be 0 for free NFTs)
        super.mint(vaultOwner, vaultId, to);

        // Find the matching subscription's image URL
        uint256 length = vaultOwnerSubscriptions[vaultOwner].length;
        string memory imageURL = DEFAULT_IMAGE_URL; // Default value if not found
        
        for (uint256 i = 0; i < length; i++) {
            if (keccak256(abi.encodePacked(vaultOwnerSubscriptions[vaultOwner][i].vaultId)) 
                    == keccak256(abi.encodePacked(vaultId))) {
                imageURL = vaultOwnerSubscriptions[vaultOwner][i].imageURL;
                break;
            }
        }

        uint256 tokenId = totalSupply() - 1;
        dealInfo[tokenId] = Deal(vaultOwner, imageURL, msg.value);
        
        emit AccessGranted(vaultOwner, vaultId, to, tokenId, msg.value);
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
        string memory imageUrl = bytes(dealInfo[id].imageURL).length > 0 
            ? dealInfo[id].imageURL 
            : DEFAULT_IMAGE_URL;
            
        string memory jsonPreImage = string.concat(
            string.concat(
                string.concat('{"name": "', nftData[id].resourceId),
                '","description":"This NFT grants access to a knowledge vault.","external_url":"https://knowledge-market.io/vaults/","image":"'
            ),
            imageUrl
        );

        string memory jsonPostImage = string.concat(
            '","attributes":[{"display_type": "date", "trait_type": "Expiration date","value": ', 
            Strings.toString(nftData[id].expirationTime)
        );
        string memory jsonPostTraits = '}]}';

        return string.concat(
            "data:application/json;utf8,",
            string.concat(
                string.concat(jsonPreImage, jsonPostImage),
                jsonPostTraits
            )
        );
    }
} 