// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PermissionedToken} from "./PermissionedToken.sol";

/// @title TokenizedDeposit (S-EUR)
/// @notice The cash leg: a tokenized commercial-bank deposit, 1:1 backed by an OSPlus
///         omnibus account ("Sammelkonto Tokenisierte Einlagen"). Two decimals = euro cents.
contract TokenizedDeposit is PermissionedToken {
    constructor(address gateway) PermissionedToken("Tokenized Deposit Euro", "S-EUR", 2, gateway) {}
}
