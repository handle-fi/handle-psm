// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "../interfaces/fxToken.sol";

contract MockToken is fxToken {
    uint8 private immutable _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals)
        fxToken(name, symbol) {
        _decimals = decimals;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
