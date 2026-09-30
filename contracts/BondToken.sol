// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PermissionedToken} from "./PermissionedToken.sol";

/// @title BondToken
/// @notice The securities leg: a bond issued as an electronic crypto security. The token's
///         balances act as the crypto securities register ("Kryptowertpapierregister" under
///         the German eWpG), kept by the registrar (the gateway). One unit = one bond with
///         the nominal value below; zero decimals because bonds are not divisible.
contract BondToken is PermissionedToken {
    string public isin;
    address public issuer;
    uint256 public nominalPerUnit; // in cash-token units (euro cents)
    uint16 public couponBps; // annual coupon in basis points, e.g. 325 = 3.25 %
    uint64 public maturity; // unix seconds

    event Issued(address indexed issuer, uint256 units, bytes32 indexed ref);

    error IssuerMismatch();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory isin_,
        uint256 nominalPerUnit_,
        uint16 couponBps_,
        uint64 maturity_,
        address gateway
    ) PermissionedToken(name_, symbol_, 0, gateway) {
        isin = isin_;
        nominalPerUnit = nominalPerUnit_;
        couponBps = couponBps_;
        maturity = maturity_;
    }

    /// @notice Issuance: records the issuer (first issue) and enters the new bonds into the
    ///         register in the issuer's name, ready to be placed with investors via DvP.
    function issue(address issuer_, uint256 units, bytes32 ref) external onlyGateway {
        if (issuer == address(0)) issuer = issuer_;
        else if (issuer != issuer_) revert IssuerMismatch();
        if (paused) revert IsPaused();
        if (!isAllowed[issuer_]) revert NotAllowed(issuer_);
        totalSupply += units;
        balanceOf[issuer_] += units;
        emit Transfer(address(0), issuer_, units);
        emit Issued(issuer_, units, ref);
    }

    /// @notice Annual coupon per bond, in cash-token units.
    function couponPerUnit() public view returns (uint256) {
        return (nominalPerUnit * couponBps) / 10_000;
    }
}
