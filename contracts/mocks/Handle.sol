// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IHandle.sol";

contract Handle is IHandle {
    using SafeMath for uint256;

    /** @dev Configured collateral tokens that may be currently deposit. */
    mapping(address => bool) public override isCollateralValid;
    /** @dev Total collateral balance held by the Treasury.
             mapping(token => collateral balance) */
    mapping(address => uint256) public totalBalances;

    /** @dev Valid fxToken mapping */
    mapping(address => bool) public override isFxTokenValid;

    /** @dev mapping(user => mapping(fxToken => vault data)) */
    mapping(address => mapping(address => Vault)) public vaults;

    /** @dev Ratio of maximum Treasury collateral that can be managed by
             the PCT at a given time. */
    uint256 public override pctCollateralUpperBound;
    // Per mille fee settings
    /** @dev Mint fee as a per mille value, or a percentage with 1 decimal. */
    uint256 public override mintFeePerMille;
    /** @dev Burn fee as a per mille value, or a percentage with 1 decimal. */
    uint256 public override burnFeePerMille;
    /** @dev Withdraw fee as a per mille value, or a percentage with 1 decimal. */
    uint256 public override withdrawFeePerMille;
    /** @dev Deposit fee as a per mille value, or a percentage with 1 decimal. */
    uint256 public override depositFeePerMille;

    /** @dev Address sending for protocol fees */
    address public override FeeRecipient;
    /** @dev Canonical Wrapped Ether address */
    address public override WETH;
    /** @dev mapping(token => oracle aggregator) */
    mapping(address => address) public oracles;

    /** @dev Whether all the relevant functions in all protocol contracts
             are currently paused (disabled) for security reasons. */
    bool public override isPaused;

    /** @dev Address for the Treasury contract */
    address payable public override treasury;
    /** @dev Address for the Comptroller contract */
    address public override comptroller;
    /** @dev Address for the VaultLibrary contract */
    address public override vaultLibrary;
    /** @dev Address for the FxKeeperPool contract */
    address public override fxKeeperPool;
    /** @dev Address for the PCT contract */
    address public override pct;
    /** @dev Address for the Liquidator contract */
    address public override liquidator;
    /** @dev Address for the Interest contract */
    address public override interest;
    /** @dev Address for the Referral contract */
    address public override referral;
    /** @dev Address for the Forex contract */
    address public override forex;
    /** @dev Address for the Rewards contract */
    address public override rewards;

    modifier notPaused() {
        require(!isPaused, "Paused");
        _;
    }

    /** @dev Proxy initialisation function */
    function initialize(address weth) public { }

    /** @dev Setter for pctCollateralUpperBound */
    function setCollateralUpperBoundPCT(uint256 ratio)
        external
        override
    {
        pctCollateralUpperBound = ratio;
    }

    /** @dev Setter for isPaused */
    function setPaused(bool value) external override {
        isPaused = value;
    }

    /** @dev Configure an ERC20 as a valid fxToken */
    function setFxToken(address token) public override {
        isFxTokenValid[token] = true;
    }

    /** @dev Invalidate an existing fxToken and remove it from the protocol */
    function removeFxToken(address token) external override {
        isFxTokenValid[token] = false;
    }

    /** @dev Configure an ERC20 as a valid collateral token */
    function setCollateralToken(
        address token,
        uint256 mintCR,
        uint256 liquidationFee,
        uint256 interestRatePerMille
    ) external override { }

    /** @dev Invalidate an existing collateral token for new deposits.
             The token will still be valid for existing deposits. */
    function removeCollateralToken(address token) external override { }

    /**
     * @dev Update all Handle contract components
     * @param components an array with the address of the components, where:
              index 0: treasury
              index 1: comptroller
              index 2: vaultLibrary
              index 3: fxKeeperPool
              index 4: pct
              index 5: liquidator
              index 6: interest
              index 7: referral
              index 8: forex
              index 9: rewards
     */
    function setComponents(address[] memory components)
        external
        override
    { }

    /** @dev Getter for collateralTokens */
    function getAllCollateralTypes()
        public
        view
        override
        returns (address[] memory collateral)
    { return new address[](0); }

    /** @dev Getter for collateralDetails */
    function getCollateralDetails(address collateral)
        external
        view
        override
        returns (CollateralData memory)
    {
        return CollateralData({
            mintCR: 0,
            liquidationFee: 0,
            interestRate: 0
        });
    }

    /**
     * @dev Updates a vault's debt position.
            Can only be called by the comptroller
     * @param account The vault account
     * @param fxToken The vault fxToken
     * @param increase Whether to increase or decrease the position
     */
    function updateDebtPosition(
        address account,
        uint256 amount,
        address fxToken,
        bool increase
    ) external override { }

    /**
     * @dev Updates a vault's collateral balance.
     * @param account The vault account
     * @param fxToken The vault fxToken
     * @param collateralToken The vault collateral token
     * @param increase Whether to increase or decrease the balance
     */
    function updateCollateralBalance(
        address account,
        uint256 amount,
        address fxToken,
        address collateralToken,
        bool increase
    ) external override {}

    /** @dev Setter for FeeRecipient */
    function setFeeRecipient(address feeRecipient)
        external
        override
    { }

    /** @dev Setter for all protocol transaction fees */
    function setFees(
        uint256 _withdrawFeePerMille,
        uint256 _depositFeePerMille,
        uint256 _mintFeePerMille,
        uint256 _burnFeePerMille
    ) external override { }

    /**
     * @dev Getter for an user's collateral balance for a given collateral type
     * @param account The user's address
     * @param fxToken The vault to check
     * @param collateralType The collateral token address
     * @return balance
     */
    function getCollateralBalance(
        address account,
        address collateralType,
        address fxToken
    ) external view override returns (uint256 balance) { return 0;}

    /**
     * @dev Getter for all collateral types deposited into a vault.
     * @param account The vault account
     * @param fxToken The vault fxToken
     * @return collateral Each collateral type deposited
     * @return balances Balance for each collateral type deposited
     */
    function getBalance(address account, address fxToken)
        external
        view
        override
        returns (address[] memory collateral, uint256[] memory balances)
    { return (new address[](0), new uint256[](0)); }

    /**
     * @dev Getter for a vault's interest collateral R0 value
     * @param account The vault account
     * @param fxToken The vault fxToken
     * @param collateral The collateral token for the R0 value
     * @return R0 The R0 interest value
     */
    function getCollateralR0(
        address account,
        address fxToken,
        address collateral
    ) external view override returns (uint256 R0) {
        return 0;
    }

    /**
     * @dev Getter for a vault's debt including interest
     * @param account The vault account
     * @param fxToken The vault fxToken
     * @return debt The amount of fxToken debt outstanding including interest
     */
    function getDebt(address account, address fxToken)
        public
        view
        override
        returns (uint256)
    { return 0; }

    /**
     * @dev Getter for a vault's debt excluding interest
     * @param account The vault account
     * @param fxToken The vault fxToken
     * @return debt the amount of fxToken debt outstanding excluding interest
     */
    function getPrincipalDebt(address account, address fxToken)
        external
        view
        override
        returns (uint256)
    { return 0; }

    /**
     * @dev Getter for a token unit price in ETH
     * @param token The token to get the price of
     * @return quote The price of 1 token in ETH
     */
    function getTokenPrice(address token)
        public
        view
        override
        returns (uint256 quote)
    { return 0; }

    /**
     * @dev Sets an oracle for a given token
     * @param token The token to set the oracle for
     * @param oracle The oracle to use for the token
     */
    function setOracle(address token, address oracle)
        external
        override
    { }
}
