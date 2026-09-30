// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPermissionedToken {
    function balanceOf(address account) external view returns (uint256);
    function setAllowed(address account, bool allowed, bytes32 ref) external;
    function controllerTransfer(address from, address to, uint256 value, bytes32 ref) external;
}

interface IBond is IPermissionedToken {
    function issuer() external view returns (address);
    function couponPerUnit() external view returns (uint256);
}

/// @title DvPSettlement
/// @notice Delivery versus payment: the bond leg and the cash leg of a trade settle in one
///         transaction. If either leg fails (e.g. the buyer lacks cash) the whole
///         transaction reverts and nothing moves, so neither side carries settlement risk.
///         Also pays coupons, computed on-chain from the register. Must be a gateway on
///         both tokens; only the operator (the bank's gateway) can instruct it.
contract DvPSettlement {
    address public operator;
    IBond public immutable bond;
    IPermissionedToken public immutable cash;
    mapping(bytes32 => bool) public settled;

    event Onboarded(address indexed account, bytes32 indexed ref);
    event Settled(bytes32 indexed tradeId, address indexed seller, address indexed buyer, uint256 units, uint256 price);
    event CouponPaid(address indexed holder, uint256 units, uint256 amount, bytes32 indexed ref);

    error NotOperator();
    error AlreadySettled(bytes32 tradeId);

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(address operator_, IBond bond_, IPermissionedToken cash_) {
        operator = operator_;
        bond = bond_;
        cash = cash_;
    }

    /// @notice Allowlist a verified customer on both the bond register and the cash token.
    function onboard(address account, bytes32 ref) external onlyOperator {
        bond.setAllowed(account, true, ref);
        cash.setAllowed(account, true, ref);
        emit Onboarded(account, ref);
    }

    /// @notice Atomic DvP: `units` bonds seller -> buyer and `price` cash buyer -> seller.
    function settle(bytes32 tradeId, address seller, address buyer, uint256 units, uint256 price) external onlyOperator {
        if (settled[tradeId]) revert AlreadySettled(tradeId);
        settled[tradeId] = true;
        bond.controllerTransfer(seller, buyer, units, tradeId); // delivery
        cash.controllerTransfer(buyer, seller, price, tradeId); // payment
        emit Settled(tradeId, seller, buyer, units, price);
    }

    /// @notice Pay one annual coupon from the issuer to each holder, computed from the register.
    function payCoupon(address[] calldata holders, bytes32 ref) external onlyOperator returns (uint256 total) {
        address issuer = bond.issuer();
        uint256 perUnit = bond.couponPerUnit();
        for (uint256 i = 0; i < holders.length; i++) {
            uint256 units = bond.balanceOf(holders[i]);
            if (units == 0 || holders[i] == issuer) continue;
            uint256 amount = units * perUnit;
            cash.controllerTransfer(issuer, holders[i], amount, ref);
            emit CouponPaid(holders[i], units, amount, ref);
            total += amount;
        }
    }
}
