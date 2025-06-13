// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC4908} from "./IERC4908.sol";

abstract contract ERC4908 is IERC4908, ERC721, ERC721Enumerable {

    struct Settings {
        string resourceId;
        uint256 price;
        uint32 expirationDuration;
    }
    mapping(bytes32 => Settings) public accessControl;

    // struct attached to each NFT id
    struct Metadata {
        bytes32 hash;
        string resourceId;
        uint32 expirationTime;
    }

    mapping(uint256 => Metadata) public nftData;

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {}

    function _hash(
        address author,
        string calldata resourceId
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(author, resourceId));
    }

    function _setAccess(
        address author,
        string calldata resourceId,
        uint256 price,
        uint32 expirationDuration
    ) private {
        bytes32 hash = _hash(author, resourceId);
        accessControl[hash] = Settings(resourceId, price, expirationDuration);
    }

    function setAccess(
        string calldata resourceId,
        uint256 price,
        uint32 expirationDuration
    ) public {
        _setAccess(msg.sender, resourceId, price, expirationDuration);
    }

    function existAccess(bytes32 hash) external view returns (bool) {
        return bytes(accessControl[hash].resourceId).length != 0;
    }
    function existAccess(
        address author,
        string calldata resourceId
    ) external view returns (bool) {
        return this.existAccess(_hash(author, resourceId));
    }

    function getAccessControl(
        address author,
        string calldata resourceId
    )
        external
        view
        override
        returns (uint256 price, uint32 expirationDuration)
    {
        bytes32 hash = _hash(author, resourceId);
        return (
            accessControl[hash].price,
            accessControl[hash].expirationDuration
        );
    }

    function mint(
        address payable author,
        string calldata resourceId,
        address to
    ) public payable virtual {
        bytes32 settingsIndex = _hash(author, resourceId);
        if (!this.existAccess(settingsIndex))
            revert MintUnavailable(settingsIndex);

        uint256 tokenId = totalSupply();

        nftData[tokenId] = Metadata(
            settingsIndex,
            accessControl[settingsIndex].resourceId,
            accessControl[settingsIndex].expirationDuration +
                uint32(block.timestamp)
        );

        _safeMint(to, tokenId);
    }

    function hasAccess(
        address author,
        string calldata resourceId,
        address consumer
    )
        public
        view
        virtual
        returns (bool response, string memory message, int32 expirationTime)
    {
        bytes32 hash = _hash(author, resourceId);

        if (!this.existAccess(hash)) {
            return (false, "access doesn't exist", -1);
        }

        bool hasExpired = false;

        for (uint256 i = 0; i < balanceOf(consumer); i++) {
            uint256 tokenId = tokenOfOwnerByIndex(consumer, i);
            Metadata memory metadata = nftData[tokenId];

            if (metadata.hash == hash) {
                if (block.timestamp > metadata.expirationTime) {
                    hasExpired = true;
                    continue;
                }
                return (true, "access granted", int32(metadata.expirationTime));
            }
        }

        return
            hasExpired
                ? (false, "access is expired", -1)
                : (false, "user doesn't own the NFT", -1);
    }

    function delAccess(string calldata resourceId) public {
        bytes32 hash = _hash(msg.sender, resourceId);
        delete accessControl[hash];
    }

    /*
     * overrides required for the ERC721 Enumerable extension
     */

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal virtual override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, ERC721Enumerable) returns (bool) {
        return
            interfaceId == type(IERC4908).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
