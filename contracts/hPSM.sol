// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IHandle.sol";
import "./interfaces/fxToken.sol";

/*                                                *\
 *                ,.-"""-.,                       *
 *               /   ===   \                      *
 *              /  =======  \                     *
 *           __|  (o)   (0)  |__                  *
 *          / _|    .---.    |_ \                 *
 *         | /.----/ O O \----.\ |                *
 *          \/     |     |     \/                 *
 *          |                   |                 *
 *          |                   |                 *
 *          |                   |                 *
 *          _\   -.,_____,.-   /_                 *
 *      ,.-"  "-.,_________,.-"  "-.,             *
 *     /          |       |  ╭-╮     \            *
 *    |           l.     .l  ┃ ┃      |           *
 *    |            |     |   ┃ ╰━━╮   |           *
 *    l.           |     |   ┃ ╭╮ ┃  .l           *
 *     |           l.   .l   ┃ ┃┃ ┃  | \,         *
 *     l.           |   |    ╰-╯╰-╯ .l   \,       *
 *      |           |   |           |      \,     *
 *      l.          |   |          .l        |    *
 *       |          |   |          |         |    *
 *       |          |---|          |         |    *
 *       |          |   |          |         |    *
 *       /"-.,__,.-"\   /"-.,__,.-"\"-.,_,.-"\    *
 *      |            \ /            |         |   *
 *      |             |             |         |   *
 *       \__|__|__|__/ \__|__|__|__/ \_|__|__/    *
\*                                                 */

contract hPSM is Ownable {
    using SafeERC20 for ERC20;
    IHandle public handle;

    /** @dev This contract's address. */
    address private immutable self;
    /** @dev Transaction fee with 18 decimals. */
    uint256 public transactionFee;
    /** @dev Mapping from pegged token address to total deposit supported. */
    mapping(address => uint256) collateralCap;
    /** @dev Mapping from fxToken to peg token address to whether the peg is set. */
    mapping(address => mapping(address => bool)) public isFxTokenPegged;

    event SetTransactionFee(uint256 fee);
    
    event SetMaximumTokenDeposit(address indexed token, uint256 amount);
    
    event SetFxTokenPeg(
        address indexed fxToken,
        address indexed peggedToken,
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
        address peggedTokenAddress,
        bool isPegged
    ) external onlyOwner {
        fxToken fxToken = fxToken(fxTokenAddress);
        assert(isFxTokenPegged[fxTokenAddress][peggedTokenAddress] != isPegged);
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
            !handle.isFxTokenValid(peggedTokenAddress),
            "PSM: not a valid peg token"
        );
        isFxTokenPegged[fxTokenAddress][peggedTokenAddress] = isPegged;
        if (!isPegged)
            fxToken.renounceRole(operatorRole, self);
        emit SetFxTokenPeg(fxTokenAddress, peggedTokenAddress, isPegged);
    }

    /** @dev Sets the maximum total deposit for a pegged token. */
    function setCollateralCap(
        address peggedToken,
        uint256 capWithPeggedTokenDecimals
    ) external onlyOwner {
        collateralCap[peggedToken] = capWithPeggedTokenDecimals;
        emit SetMaximumTokenDeposit(peggedToken, capWithPeggedTokenDecimals);
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
        require(
            amount > 0,
            "PSM: amount must be > 0"
        );
        ERC20 peggedToken = ERC20(peggedTokenAddress);
        require(
            collateralCap[peggedTokenAddress] == 0 ||
                amount + peggedToken.balanceOf(self)
                    <= collateralCap[peggedTokenAddress],
            "PSM: collateral cap exceeded"
        );
        peggedToken.safeTransferFrom(
            msg.sender,
            self,
            amount
        );
        uint256 amountOut = calculateAmountAfterFees(
            calculateAmountForDecimalChange(
                peggedTokenAddress,
                fxTokenAddress,
                amount
            )
        );
        require(amountOut > 0, "PSM: prevented nil transfer");
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
        uint256 amountOutGross = calculateAmountForDecimalChange(
            fxTokenAddress,
            peggedTokenAddress,
            amount
        );
        require(
            peggedToken.balanceOf(self) >= amountOutGross,
            "PSM: contract lacks liquidity"
        );
        fxToken fxToken = fxToken(fxTokenAddress);
        require(
            fxToken.balanceOf(msg.sender) >= amount,
            "PSM: insufficient fx balance"
        );
        fxToken.burn(msg.sender, amount);
        uint256 amountOut = calculateAmountAfterFees(
            amountOutGross
        );
        require(amountOut > 0, "PSM: prevented nil transfer");
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

    /** @dev Converts an amount to match a different decimal count. */
    function calculateAmountForDecimalChange(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) private returns (uint256) {
        uint256 decimalsIn = uint256(ERC20(tokenIn).decimals());
        uint256 decimalsOut = uint256(ERC20(tokenOut).decimals());
        uint256 decimalsDiff;
        if (decimalsIn > decimalsOut) {
            decimalsDiff = decimalsIn - decimalsOut;
            return amountIn / (10 ** decimalsDiff);
        } else {
            decimalsDiff = decimalsOut - decimalsIn;
            return amountIn * (10 ** decimalsDiff);
        }
        return amountIn;
    }
}
