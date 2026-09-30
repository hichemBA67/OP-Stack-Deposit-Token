// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PermissionedToken
/// @notice Base for the demo's regulated tokens (cash and securities). Only allowlisted
///         (KYC/KYB-verified) wallets can hold or move tokens. "Gateways" (the bank's
///         abstraction layer and the DvP settlement contract) mint, burn and execute
///         custodial transfers. Every state change carries a bytes32 business reference
///         (e.g. the OSPlus EndToEndId or trade id) for 1:1 reconciliation.
/// @dev    Deliberately dependency-free so it compiles with plain solc. Demo only.
abstract contract PermissionedToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    address public admin;
    mapping(address => bool) public isGateway;
    mapping(address => bool) public isAllowed;
    bool public paused;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Allowlisted(address indexed account, bool allowed, bytes32 indexed ref);
    event Minted(address indexed to, uint256 value, bytes32 indexed ref);
    event Burned(address indexed from, uint256 value, bytes32 indexed ref);
    event ControllerTransfer(address indexed from, address indexed to, uint256 value, bytes32 indexed ref);
    event GatewaySet(address indexed gateway, bool enabled);
    event Paused(bool paused);

    error NotAdmin();
    error NotGateway();
    error NotAllowed(address account);
    error InsufficientBalance();
    error InsufficientAllowance();
    error IsPaused();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyGateway() {
        if (!isGateway[msg.sender]) revert NotGateway();
        _;
    }

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address gateway) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        admin = msg.sender;
        isGateway[gateway] = true;
        emit GatewaySet(gateway, true);
    }

    // ---------------------------------------------------------------- admin

    function setGateway(address gateway, bool enabled) external onlyAdmin {
        isGateway[gateway] = enabled;
        emit GatewaySet(gateway, enabled);
    }

    function setPaused(bool p) external onlyAdmin {
        paused = p;
        emit Paused(p);
    }

    // -------------------------------------------------------------- gateway

    function setAllowed(address account, bool allowed, bytes32 ref) external onlyGateway {
        isAllowed[account] = allowed;
        emit Allowlisted(account, allowed, ref);
    }

    function mint(address to, uint256 value, bytes32 ref) external onlyGateway {
        if (paused) revert IsPaused();
        if (!isAllowed[to]) revert NotAllowed(to);
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
        emit Minted(to, value, ref);
    }

    function burn(address from, uint256 value, bytes32 ref) external onlyGateway {
        if (paused) revert IsPaused();
        if (balanceOf[from] < value) revert InsufficientBalance();
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
        emit Burned(from, value, ref);
    }

    /// @notice Custodial transfer executed on behalf of a customer (the bank holds
    ///         customer keys in its HSM in the custodial model).
    function controllerTransfer(address from, address to, uint256 value, bytes32 ref) external onlyGateway {
        _transfer(from, to, value);
        emit ControllerTransfer(from, to, value, ref);
    }

    // --------------------------------------------------------------- ERC-20

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a < value) revert InsufficientAllowance();
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (paused) revert IsPaused();
        if (!isAllowed[from]) revert NotAllowed(from);
        if (!isAllowed[to]) revert NotAllowed(to);
        if (balanceOf[from] < value) revert InsufficientBalance();
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
