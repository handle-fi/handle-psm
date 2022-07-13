﻿import { ethers } from "hardhat";
import { Signer, BigNumber, Wallet } from "ethers";
import { expect } from "chai";
import { getEventData } from "./utils";
import {
  FxToken,
  FxToken__factory,
  Handle,
  Handle__factory,
  HPSM2,
  HPSM2__factory,
  MockToken__factory
} from "../build/typechain";

let fxUSD: FxToken;
let usdc: FxToken;
let psm2: HPSM2;
let deployer: Signer;
let user: Wallet;

const pauseDeposits = async () => {
  const receipt = await (await psm2.setPausedDeposits(true)).wait();
    const event: {
      isPaused: boolean,
    } = getEventData("SetPauseDeposits", psm2, receipt);
    expect(event.isPaused).to.be.true;
    expect(await psm2.areDepositsPaused()).to.be.true;
};

const unpauseDeposits = async () => {
  const receipt = await (await psm2.setPausedDeposits(false)).wait();
    const event: {
      isPaused: boolean,
    } = getEventData("SetPauseDeposits", psm2, receipt);
    expect(event.isPaused).to.be.false;
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
  it("Should not allow pegging for a non-fxToken", async () => {
    // This will not work because fxUSD was not set as a fxToken in
    // the mock Handle contract yet.
    expect(
      psm2.setFxTokenPeg(
        fxUSD.address,
        usdc.address,
        true
      )
    ).to.be.revertedWith("PSM: not a valid fxToken");
  });
  it("Should peg USDC to fxUSD", async () => {
    // Make PSM an fxToken operator.
    await fxUSD.grantRole(
      await fxUSD.OPERATOR_ROLE(),
      psm2.address,
    );
    // Try setting the peg.
    const receipt = await (await psm2.setFxTokenPeg(
      fxUSD.address,
      usdc.address,
      true
    )).wait();
    const event: {
      fxToken: string,
      peggedToken: string,
      isPegged: boolean,
    } = getEventData("SetFxTokenPeg", psm2, receipt);
    expect(event.fxToken).to.equal(fxUSD.address);
    expect(event.peggedToken).to.equal(usdc.address);
    expect(event.isPegged).to.be.true;
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
    const receipt = await (await psm2.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    )).wait();
    const event: {
      fxToken: string,
      peggedToken: string,
      account: string,
      amountIn: BigNumber,
      amountOut: BigNumber,
    } = getEventData("Deposit", psm2, receipt);
    expect(event.fxToken).to.equal(fxUSD.address);
    expect(event.peggedToken).to.equal(usdc.address);
    expect(event.account).to.equal(await user.getAddress());
    expect(event.amountIn).to.equal(ethers.utils.parseUnits("1", 6));
    expect(event.amountOut).to.equal(ethers.utils.parseUnits("1", 18));
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
    const receipt = await (await psm2.connect(user).withdraw(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 18)
    )).wait();
    const event: {
      fxToken: string,
      peggedToken: string,
      account: string,
      amountIn: BigNumber,
      amountOut: BigNumber,
    } = getEventData("Withdraw", psm2, receipt);
    expect(event.fxToken).to.equal(fxUSD.address);
    expect(event.peggedToken).to.equal(usdc.address);
    expect(event.account).to.equal(await user.getAddress());
    expect(event.amountIn).to.equal(ethers.utils.parseUnits("1", 18));
    expect(event.amountOut).to.equal(ethers.utils.parseUnits("1", 6));
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
  });
  it("Should set 50% fee", async () => {
    const receipt = await (await psm2.setTransactionFee(
      ethers.utils.parseEther("0.5")
    )).wait();
    const event: {
      fee: BigNumber,
    } = getEventData("SetTransactionFee", psm2, receipt);
    expect(event.fee).to.equal(ethers.utils.parseEther("0.5"));
  });
  it("Should deposit 1 USDC for 0.5 fxUSD (including fee)", async () => {
    await usdc.connect(user).approve(psm2.address, ethers.constants.MaxUint256);
    const receipt = await (await psm2.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    )).wait();
    const event: {
      fxToken: string,
      peggedToken: string,
      account: string,
      amountIn: BigNumber,
      amountOut: BigNumber,
    } = getEventData("Deposit", psm2, receipt);
    expect(event.fxToken).to.equal(fxUSD.address);
    expect(event.peggedToken).to.equal(usdc.address);
    expect(event.account).to.equal(await user.getAddress());
    expect(event.amountIn).to.equal(ethers.utils.parseUnits("1", 6));
    expect(event.amountOut).to.equal(ethers.utils.parseUnits("0.5", 18));
    expect(await fxUSD.balanceOf(await user.getAddress())).to.equal(
      ethers.utils.parseUnits("0.5", 18)
    );
    expect(await usdc.balanceOf(await user.getAddress())).to.equal(0);
  });
  it("Should withdraw 0.5 fxUSD for 0.25 USDC (including fee)", async () => {
    const receipt = await (await psm2.connect(user).withdraw(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("0.5", 18)
    )).wait();
    const event: {
      fxToken: string,
      peggedToken: string,
      account: string,
      amountIn: BigNumber,
      amountOut: BigNumber,
    } = getEventData("Withdraw", psm2, receipt);
    expect(event.fxToken).to.equal(fxUSD.address);
    expect(event.peggedToken).to.equal(usdc.address);
    expect(event.account).to.equal(await user.getAddress());
    expect(event.amountIn).to.equal(ethers.utils.parseUnits("0.5", 18));
    expect(event.amountOut).to.equal(ethers.utils.parseUnits("0.25", 6));
    expect(await usdc.balanceOf(await user.getAddress())).to.equal(
      ethers.utils.parseUnits("0.25", 6)
    );
    expect(await fxUSD.balanceOf(await user.getAddress())).to.equal(0);
  });
  it("Should collect the accrued 0.75 USDC in fees", async () => {
    const accrued = await psm2.accruedFees(usdc.address);
    expect(accrued).to.equal(ethers.utils.parseUnits("0.75", 6));
    await psm2.collectAccruedFees(usdc.address);
    expect(await usdc.balanceOf(await deployer.getAddress())).to.equal(
      ethers.utils.parseUnits("0.75", 6)
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
  it("Should remove the peg of USDC to fxUSD", async () => {
    // Try setting the peg.
    const receipt = await (await psm2.setFxTokenPeg(
      fxUSD.address,
      usdc.address,
      false
    )).wait();
    const event: {
      fxToken: string,
      peggedToken: string,
      isPegged: boolean,
    } = getEventData("SetFxTokenPeg", psm2, receipt);
    expect(event.fxToken).to.equal(fxUSD.address);
    expect(event.peggedToken).to.equal(usdc.address);
    expect(event.isPegged).to.be.false;
    // PSM should have renounced role.
    expect(await fxUSD.hasRole(
      await fxUSD.OPERATOR_ROLE(),
      psm2.address,
    )).to.be.false;
  });
});