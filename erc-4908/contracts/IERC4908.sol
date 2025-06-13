// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

interface IERC4908 {
    /// @notice Allows content access NFT to be minted
    /// @dev This function is meant to be called by the content author
    /// @param resourceId The content identification from the off-chain content service provider
    /// @param price The mint price, in other terms the access price for this particular content
    /// @param expirationDuration The expiration time of the access
    function setAccess(
        string calldata resourceId,
        uint256 price,
        uint32 expirationDuration
    ) external;

    /// @notice Disallows content access NFT to be minted, the remaining NFTs can still be used
    /// @dev This function is meant to be called by the content author
    /// @param resourceId The content identification from the off-chain content service provider
    function delAccess(string calldata resourceId) external;

    /// @notice Check for the access to a particular content from a particular consumer
    /// @dev This function is meant to be called by the content provider, the 2 first parameters
    ///      are meant to certify that the content ID is owned by the author while the last
    ///      `consumer` parameter is used to find if the consumer owns an NFT for this content
    ///      that is not expired.
    /// @param author The address of the content author
    /// @param resourceId The content identification from the off-chain content service provider
    /// @param consumer The address of the content consumer
    /// @return response True if the consumer has access to the content, false otherwise
    /// @return message A message indicating the access status: "access doesn't exist", "access is expired", "access granted" or "user doesn't own the NFT"
    /// @return expirationTime The expiration time of the access if message is "access granted", -1 otherwise
    function hasAccess(
        address author,
        string calldata resourceId,
        address consumer
    )
        external
        view
        returns (bool response, string calldata message, int32 expirationTime);

    /// @notice Check if the given access hash exists
    /// @dev This function is called internally but can be also handy for external use
    /// @param hash The hash of the author and resourceId, used as the index of settings mapping
    /// @return response True if the access hash exists, false otherwise
    function existAccess(bytes32 hash) external view returns (bool response);

    /// @notice Check if the given access hash exists
    /// @dev overload of existAccess(bytes32)
    /// @param author The address of the content author
    /// @param resourceId The content identification from the off-chain content service provider
    /// @return response True if the access hash exists, false otherwise
    function existAccess(
        address author,
        string calldata resourceId
    ) external view returns (bool response);

    /// @notice Get the requirement settings to mint NFT access for a particular resource
    /// @dev This function is meant to be called by the content consumer who wants to mint an NFT
    /// @param author The address of the resource author
    /// @param resourceId The content identification from the off-chain service provider
    /// @return price The mint price, in other terms the access price for this particular resource
    /// @return expirationDuration The duration of the access for each NFT minted
    function getAccessControl(
        address author,
        string calldata resourceId
    ) external view returns (uint256 price, uint32 expirationDuration);

    /// @notice Mints a content access NFT
    /// @dev This function is meant to be called by the content consumer
    /// @param author address hashed with resourceId to retrieve the content settings specified by the author
    /// @param resourceId The content identification from the off-chain content service provider
    /// @param to The address of the content consumer
    function mint(
        address payable author,
        string calldata resourceId,
        address to
    ) external payable;

    /// @notice The author hasn't activated mint access for this resourceId
    /// @param accessHash The hash of the author and resourceId, used as the index of settings mapping
    error MintUnavailable(bytes32 accessHash);

    /// @notice The author's minting fee has not been met by the consumer
    /// @param expectedPrice A message indicating the minting fee is not met
    error InsufficientFunds(uint256 expectedPrice);
}
