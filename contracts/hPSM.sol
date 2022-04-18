// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IHandle.sol";
import "./interfaces/fxToken.sol";

contract hPSM is Ownable {
    using SafeERC20 for ERC20;
    IHandle public handle;

    /** @dev This contract's address. */
    address private immutable self;
    /** @dev Transaction fee with 18 decimals. */
    uint256 public transactionFee;
    /** @dev Mapping from fxToken to peg token address to whether the peg is set. */
    mapping(address => mapping(address => bool)) public isFxTokenPegged;

    event SetTransactionFee(uint256 fee);
    
    event SetFxTokenPeg(
        address indexed fxToken,
        address indexed pegToken,
        bool isPegged
    );

    event Deposit(
        address indexed fxToken,
        address indexed peggedToken,
        address indexed account,
        uint256 amountIn,
        uint256 amountOut
    );
 
    event Withdraw(
        address indexed fxToken,
        address indexed peggedToken,
        address indexed account,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(IHandle _handle) {
        self = address(this);
        handle = _handle;
    }

    /** @dev Sets the transaction fee. */
    function setTransactionFee(uint256 fee) external onlyOwner {
        require(fee < 1 ether, "PSM: fee must be < 100%");
        transactionFee = fee;
        emit SetTransactionFee(transactionFee);
    }

    /** @dev Configures a fxToken peg to a collateral token. */
    function setFxTokenPeg(
        address fxTokenAddress,
        address pegToken,
        bool isPegged
    ) external onlyOwner {
        fxToken fxToken = fxToken(fxTokenAddress);
        assert(isFxTokenPegged[fxTokenAddress][pegToken] != isPegged);
        require(
            handle.isFxTokenValid(fxTokenAddress),
            "PSM: not a valid fxToken"
        );
        bytes32 operatorRole = fxToken.OPERATOR_ROLE();
        require(
            !isPegged || fxToken.hasRole(operatorRole, self),
            "PSM: not an fxToken operator"
        );
        require(
            !handle.isFxTokenValid(pegToken),
            "PSM: not a valid peg token"
        );
        isFxTokenPegged[fxTokenAddress][pegToken] = isPegged;
        if (!isPegged)
            fxToken.renounceRole(operatorRole, self);
        emit SetFxTokenPeg(fxTokenAddress, pegToken, isPegged);
    }

    /** @dev Receives a pegged token in exchange for minting fxToken for an account. */
    function deposit(
        address fxTokenAddress,
        address peggedTokenAddress,
        uint256 amount
    ) external {    
        require(
            isFxTokenPegged[fxTokenAddress][peggedTokenAddress],
            "PSM: fxToken not pegged to peggedToken"
        );
        ERC20(peggedTokenAddress).safeTransferFrom(
            msg.sender,
            self,
            amount
        );
        uint256 amountOut = calculateAmountAfterFees(amount);
        fxToken(fxTokenAddress).mint(msg.sender, amountOut);
        emit Deposit(
            fxTokenAddress,
            peggedTokenAddress,
            msg.sender,
            amount,
            amountOut
        );
    }

    /** @dev Burns an account's fxToken balance in exchange for a pegged token. */
    function withdraw(
        address fxTokenAddress,
        address peggedTokenAddress,
        uint256 amount
    ) external {
        require(
            isFxTokenPegged[fxTokenAddress][peggedTokenAddress],
            "PSM: fxToken not pegged to peggedToken"
        );
        ERC20 peggedToken = ERC20(peggedTokenAddress);
        require(
            peggedToken.balanceOf(self) >= amount,
            "PSM: contract lacks liquidity"
        );
        fxToken fxToken = fxToken(fxTokenAddress);
        require(
            fxToken.balanceOf(msg.sender) >= amount,
            "PSM: insufficient fx balance"
        );
        fxToken.burn(msg.sender, amount);
        uint256 amountOut = calculateAmountAfterFees(amount);
        peggedToken.safeTransfer(msg.sender, amountOut);
        emit Withdraw(
            fxTokenAddress,
            peggedTokenAddress,
            msg.sender,
            amount,
            amountOut
        );
    }

    /** @dev Converts an input amount to after fees. */
    function calculateAmountAfterFees(uint256 amount) private returns (uint256) {
        return amount * (1 ether - transactionFee) / 1 ether;
    }
}
