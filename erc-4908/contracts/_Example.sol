// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC4908} from "./ERC4908.sol";

contract Example is ERC4908 {
    constructor()
        ERC4908("Gated resources NFT access ERC-4908 standard", "ERC4908")
    {}
}
