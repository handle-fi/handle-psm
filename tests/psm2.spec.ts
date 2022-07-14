import { ethers } from "hardhat";
import { Signer, Wallet } from "ethers";
import { expect } from "chai";
import {
  FxToken,
  FxToken__factory,
  HPSM2,
  HPSM2__factory,
  MockToken__factory
} from "../build/typechain";

let fxUSD: FxToken;
let usdc: FxToken;
let dai: FxToken;
let psm2: HPSM2;
let deployer: Signer;
let user: Wallet;

const pauseDeposits = async () => {
  await expect(psm2.setPausedDeposits(true))
    .to
    .emit(psm2, "SetPauseDeposits")
    .withArgs(true);
  expect(await psm2.areDepositsPaused()).to.be.true;
};

const unpauseDeposits = async () => {
  await expect(psm2.setPausedDeposits(false))
    .to
    .emit(psm2, "SetPauseDeposits")
    .withArgs(false);
  expect(await psm2.areDepositsPaused()).to.be.false;
};

describe("hPSM2", () => {
  before(async () => {
    deployer = (await ethers.getSigners())[0];
    user = new ethers.Wallet(
      "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
      deployer.provider
    );
    // Send ETH to user from signer.
    await deployer.sendTransaction({
      to: user.address,
      value: ethers.utils.parseEther("1000")
    });
    fxUSD = await new FxToken__factory(deployer)
      .deploy("handle USD", "fxUSD");
    usdc = await new MockToken__factory(deployer)
      .deploy("USD Coin", "USDC", 6);
    dai = await new MockToken__factory(deployer)
      .deploy("Dai Stablecoin", "DAI", 18);
    expect(await fxUSD.decimals()).to.equal(18);
    expect(await usdc.decimals()).to.equal(6);
    psm2 = await new HPSM2__factory(deployer).deploy();
  });
  it("Should not allow depositing for non-fxTokens", async () => {
    await expect(
      psm2.connect(user).deposit(
        fxUSD.address,
        usdc.address,
        ethers.utils.parseUnits("1", 6)
     )
    ).to.be.revertedWith("PSM: fxToken not pegged to peggedToken");
  });
  it("Should not allow pegging if address isn't an operator", async () => {
    expect(
      psm2.setFxTokenPeg(
        fxUSD.address,
        usdc.address,
        true
      )
    ).to.be.revertedWith("PSM: not an fxToken operator");
  });
  it("Should peg USDC to fxUSD", async () => {
    // Make PSM an fxToken operator.
    await fxUSD.grantRole(
      await fxUSD.OPERATOR_ROLE(),
      psm2.address,
    );
    // Try setting the peg.
    await expect(psm2.setFxTokenPeg(
      fxUSD.address,
      usdc.address,
      true
    ))
      .to
      .emit(psm2, "SetFxTokenPeg")
      .withArgs(fxUSD.address, usdc.address, true);
  });
  it("Should peg DAI to fxUSD", async () => {
    // Try setting the peg.
    await expect(psm2.setFxTokenPeg(
      fxUSD.address,
      dai.address,
      true
    ))
      .to
      .emit(psm2, "SetFxTokenPeg")
      .withArgs(fxUSD.address, dai.address, true);
  });
  it("Should pause deposits", async () => {
    await pauseDeposits();
  });
  it("Should not allow depositing due to paused deposits", async () => {
    await usdc.mint(user.address, ethers.utils.parseUnits("1", 6));
    await usdc.connect(user).approve(psm2.address, ethers.constants.MaxUint256);
    await expect(psm2.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    )).to.be.revertedWith("PSM: deposits are paused");
  });
  it("Should unpause deposits", async () => {
    await unpauseDeposits();
  });
  it("Should deposit 1 USDC for 1 fxUSD", async () => {
    await expect(psm2.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    ))
      .to
      .emit(psm2, "Deposit")
      .withArgs(
        // fxToken (address)
        fxUSD.address,
        // peggedToken (address)
        usdc.address,
        // account (address)
        await user.getAddress(),
        // amountIn (uint256)
        ethers.utils.parseUnits("1", 6),
        // amountOut (uint256)
        ethers.utils.parseUnits("1", 18)
      );
    expect(await fxUSD.balanceOf(await user.getAddress())).to.equal(
      ethers.utils.parseUnits("1", 18)
    );
    expect(await usdc.balanceOf(await user.getAddress())).to.equal(0);
  });
  it("Should have increased deposits value of fxUSD -> USDC", async () => {
    expect(await psm2.fxTokenDeposits(fxUSD.address, usdc.address)).to.equal(
      ethers.utils.parseUnits("1", 6)
    );
  });
  it("Should pause deposits before withdraw", async () => {
    await pauseDeposits();
  });
  it("Should withdraw 1 fxUSD for 1 USDC while deposits are paused", async () => {
    await expect(psm2.connect(user).withdraw(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 18)
    ))
      .to
      .emit(psm2, "Withdraw")
      .withArgs(
        // fxToken (address)
        fxUSD.address,
        // peggedToken (address)
        usdc.address,
        // account (address)
        await user.getAddress(),
        // amountIn (uint256)
        ethers.utils.parseUnits("1", 18),
        // amountOut (uint256)
        ethers.utils.parseUnits("1", 6)
      );
    expect(await usdc.balanceOf(await user.getAddress())).to.equal(
      ethers.utils.parseUnits("1", 6)
    );
    expect(await fxUSD.balanceOf(await user.getAddress())).to.equal(0);
  });
  it("Should have decreased deposits value of fxUSD -> USDC", async () => {
    expect(await psm2.fxTokenDeposits(fxUSD.address, usdc.address)).to.equal(0);
  });
  it("Should unpause deposits", async () => {
    await unpauseDeposits();
  })
  it("Should set 50% fee for USDC", async () => {
    await expect(psm2.setTransactionFee(
      usdc.address,
      ethers.utils.parseEther("0.5")
    ))
      .to
      .emit(psm2, "SetTransactionFee")
      .withArgs(
        // token (address)
        usdc.address,
        // fee (uint256)
        ethers.utils.parseEther("0.5")
      );
  });
  it("Should set 10% fee for DAI", async () => {
    await expect(psm2.setTransactionFee(
      dai.address,
      ethers.utils.parseEther("0.1")
    ))
      .to
      .emit(psm2, "SetTransactionFee")
      .withArgs(
        // token (address)
        dai.address,
        // fee (uint256)
        ethers.utils.parseEther("0.1")
      );
  });
  it("Should deposit 1 USDC for 0.5 fxUSD (including fee)", async () => {
    await usdc.connect(user).approve(psm2.address, ethers.constants.MaxUint256);
    await expect(psm2.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    ))
      .to
      .emit(psm2, "Deposit")
      .withArgs(
        // fxToken (address)
        fxUSD.address,
        // peggedToken (address)
        usdc.address,
        // account (address)
        await user.getAddress(),
        // amountIn (uint256)
        ethers.utils.parseUnits("1", 6),
        // amountOut (uint256)
        ethers.utils.parseUnits("0.5", 18)
      );
    expect(await fxUSD.balanceOf(await user.getAddress())).to.equal(
      ethers.utils.parseUnits("0.5", 18)
    );
    expect(await usdc.balanceOf(await user.getAddress())).to.equal(0);
  });
  it("Should withdraw 0.5 fxUSD for 0.25 USDC (including fee)", async () => {
    await expect(psm2.connect(user).withdraw(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("0.5", 18)
    ))
      .to
      .emit(psm2, "Withdraw")
      .withArgs(
        // fxToken (address)
        fxUSD.address,
        // peggedToken (address)
        usdc.address,
        // account (address)
        await user.getAddress(),
        // amountIn (uint256)
        ethers.utils.parseUnits("0.5", 18),
        // amountOut (uint256)
        ethers.utils.parseUnits("0.25", 6)
      );
    expect(await usdc.balanceOf(await user.getAddress())).to.equal(
      ethers.utils.parseUnits("0.25", 6)
    );
    expect(await fxUSD.balanceOf(await user.getAddress())).to.equal(0);
  });
  it("Should deposit 1 DAI for 0.9 fxUSD (including fee)", async () => {
    await dai.mint(user.address, ethers.utils.parseUnits("1", 18));
    await dai.connect(user).approve(psm2.address, ethers.constants.MaxUint256);
    await expect(psm2.connect(user).deposit(
      fxUSD.address,
      dai.address,
      ethers.utils.parseUnits("1", 18)
    ))
      .to
      .emit(psm2, "Deposit")
      .withArgs(
        // fxToken (address)
        fxUSD.address,
        // peggedToken (address)
        dai.address,
        // account (address)
        await user.getAddress(),
        // amountIn (uint256)
        ethers.utils.parseUnits("1", 18),
        // amountOut (uint256)
        ethers.utils.parseUnits("0.9", 18)
      );
    expect(await fxUSD.balanceOf(await user.getAddress())).to.equal(
      ethers.utils.parseUnits("0.9", 18)
    );
    expect(await dai.balanceOf(await user.getAddress())).to.equal(0);
  });
  it("Should collect the accrued 0.75 USDC in fees", async () => {
    const accrued = await psm2.accruedFees(usdc.address);
    expect(accrued).to.equal(ethers.utils.parseUnits("0.75", 6));
    await psm2.collectAccruedFees(usdc.address);
    expect(await usdc.balanceOf(await deployer.getAddress())).to.equal(
      ethers.utils.parseUnits("0.75", 6)
    );
  });
  it("Should collect the accrued 0.1 DAI in fees", async () => {
    const accrued = await psm2.accruedFees(dai.address);
    expect(accrued).to.equal(ethers.utils.parseUnits("0.1", 18));
    await psm2.collectAccruedFees(dai.address);
    expect(await dai.balanceOf(await deployer.getAddress())).to.equal(
      ethers.utils.parseUnits("0.1", 18)
    );
  });
  it("Should not let collect fees twice", async () => {
    const accrued = await psm2.accruedFees(usdc.address);
    expect(accrued).to.equal(0);
    await expect(psm2.collectAccruedFees(usdc.address))
      .to.be.revertedWith("PSM: no fee accrual");
    expect(await usdc.balanceOf(await deployer.getAddress())).to.equal(
      ethers.utils.parseUnits("0.75", 6)
    );
  });
  it("Should not allow depositing over cap of 1 USDC", async () => {
    await usdc.mint(await user.getAddress(), ethers.utils.parseUnits("2", 6));
    await psm2.setCollateralCap(
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    );
    await psm2.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
   );
    await expect(
      psm2.connect(user).deposit(
        fxUSD.address,
        usdc.address,
        ethers.utils.parseUnits("1", 6)
     )
    ).to.be.revertedWith("PSM: collateral cap exceeded");
  });
  it("Should not allow withdrawing if there isn't liquidity", async () => {
    await fxUSD
      .mint(user.address, ethers.utils.parseUnits("10", 18));
    await expect(
      psm2.connect(user).withdraw(
        fxUSD.address,
        usdc.address,
        ethers.utils.parseUnits("10", 18)
     )
    ).to.be.revertedWith("PSM: contract lacks liquidity");
  });
  it("Should not allow withdrawing if there isn't liquidity, and paused", async () => {
    await pauseDeposits();
    await expect(
      psm2.connect(user).withdraw(
        fxUSD.address,
        usdc.address,
        ethers.utils.parseUnits("10", 18)
     )
    ).to.be.revertedWith("PSM: paused + no liquidity");
  });
  it("Should remove the peg of USDC to fxUSD", async () => {
    // Try setting the peg.
    await expect(psm2.setFxTokenPeg(
      fxUSD.address,
      usdc.address,
      false
    ))
      .to
      .emit(psm2, "SetFxTokenPeg")
      .withArgs(
        // fxToken (address)
        fxUSD.address,
        // peggedToken (address)
        usdc.address,
        // isPegged (bool)
        false,
      );
    // PSM should have renounced role.
    expect(await fxUSD.hasRole(
      await fxUSD.OPERATOR_ROLE(),
      psm2.address,
    )).to.be.false;
  });
});
