// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KnowledgeAccessNFT} from "./KnowledgeAccessNFT.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title KnowledgeMarketV2
 * @notice Extension of KnowledgeAccessNFT with support for V2 new features.
 * @dev This contract is designed to be upgradeable via proxy. Initialization logic should be placed in `initializeV2()`, not the constructor.
 */
contract KnowledgeMarketV2 is Initializable, KnowledgeAccessNFT {

    /// @notice Initializes the V2 contract with the NFT name and symbol.
    /// @dev This constructor disables initializers to prevent proxy misuse.
    constructor() KnowledgeAccessNFT("Knowledge Market Access", "KMA") {
        _disableInitializers();
    }

   /// @dev Add your new logic below this line
}
