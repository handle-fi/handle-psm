import { ethers } from "hardhat";
import { Signer, Wallet } from "ethers";
import { expect } from "chai";
import {
  FxToken,
  FxToken__factory,
  Handle,
  Handle__factory,
  HPSM,
  HPSM__factory,
  MockToken__factory
} from "../build/typechain";

let handle: Handle;
let fxUSD: FxToken;
let usdc: FxToken;
let psm: HPSM;
let deployer: Signer;
let user: Wallet;

const pauseDeposits = async () => {
  await expect(psm.setPausedDeposits(true))
    .to
    .emit(psm, "SetPauseDeposits")
    .withArgs(true);
  expect(await psm.areDepositsPaused()).to.be.true;
};

const unpauseDeposits = async () => {
  await expect(psm.setPausedDeposits(false))
    .to
    .emit(psm, "SetPauseDeposits")
    .withArgs(false);
  expect(await psm.areDepositsPaused()).to.be.false;
};

describe("hPSM", () => {
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
    handle = await new Handle__factory(deployer).deploy()
    fxUSD = await new FxToken__factory(deployer)
      .deploy("handle USD", "fxUSD");
    usdc = await new MockToken__factory(deployer)
      .deploy("USD Coin", "USDC", 6);
    expect(await fxUSD.decimals()).to.equal(18);
    expect(await usdc.decimals()).to.equal(6);
    psm = await new HPSM__factory(deployer)
      .deploy(handle.address);
  });
  it("Should not allow to deploy with handle == address(0)", async () => {
    await expect(
      new HPSM__factory(deployer).deploy(ethers.constants.AddressZero)
    ).to.be.revertedWith("PSM: handle cannot be null");
  });
  it("Should not allow depositing for non-fxTokens", async () => {
    await expect(
      psm.connect(user).deposit(
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
      psm.setFxTokenPeg(
        fxUSD.address,
        usdc.address,
        true
      )
    ).to.be.revertedWith("PSM: not a valid fxToken");
  });
  it("Should peg USDC to fxUSD", async () => {
    // Make fxUSD a fxToken in the mock contract.
    await handle.setFxToken(fxUSD.address);
    // Make PSM an fxToken operator.
    await fxUSD.grantRole(
      await fxUSD.OPERATOR_ROLE(),
      psm.address,
    );
    // Try setting the peg.
    await expect(psm.setFxTokenPeg(
      fxUSD.address,
      usdc.address,
      true
    ))
      .to
      .emit(psm, "SetFxTokenPeg")
      .withArgs(fxUSD.address, usdc.address, true);
  });
  it("Should pause deposits", async () => {
    await pauseDeposits();
  });
  it("Should not allow depositing due to paused deposits", async () => {
    await usdc.mint(user.address, ethers.utils.parseUnits("1", 6));
    await usdc.connect(user).approve(psm.address, ethers.constants.MaxUint256);
    await expect(psm.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    )).to.be.revertedWith("PSM: deposits are paused");
  });
  it("Should unpause deposits", async () => {
    await unpauseDeposits();
  });
  it("Should deposit 1 USDC for 1 fxUSD", async () => {
    await expect(psm.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    ))
      .to
      .emit(psm, "Deposit")
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
    expect(await psm.fxTokenDeposits(fxUSD.address, usdc.address)).to.equal(
      ethers.utils.parseUnits("1", 6)
    );
  });
  it("Should pause deposits before withdraw", async () => {
    await pauseDeposits();
  });
  it("Should withdraw 1 fxUSD for 1 USDC while deposits are paused", async () => {
    await expect(psm.connect(user).withdraw(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 18)
    ))
      .to
      .emit(psm, "Withdraw")
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
    expect(await psm.fxTokenDeposits(fxUSD.address, usdc.address)).to.equal(0);
  });
  it("Should unpause deposits", async () => {
    await unpauseDeposits();
  });
  it("Should set 50% fee", async () => {
    await expect(psm.setTransactionFee(
      ethers.utils.parseEther("0.5")
    ))
      .to
      .emit(psm, "SetTransactionFee")
      .withArgs(ethers.utils.parseEther("0.5"));
  });
  it("Should deposit 1 USDC for 0.5 fxUSD (including fee)", async () => {
    await usdc.connect(user).approve(psm.address, ethers.constants.MaxUint256);
    await expect(psm.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    ))
      .to
      .emit(psm, "Deposit")
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
    await expect(psm.connect(user).withdraw(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("0.5", 18)
    ))
      .to
      .emit(psm, "Withdraw")
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
  it("Should collect the accrued 0.75 USDC in fees", async () => {
    const accrued = await psm.accruedFees(usdc.address);
    expect(accrued).to.equal(ethers.utils.parseUnits("0.75", 6));
    await psm.collectAccruedFees(usdc.address);
    expect(await usdc.balanceOf(await deployer.getAddress())).to.equal(
      ethers.utils.parseUnits("0.75", 6)
    );
  });
  it("Should not let collect fees twice", async () => {
    const accrued = await psm.accruedFees(usdc.address);
    expect(accrued).to.equal(0);
    await expect(psm.collectAccruedFees(usdc.address))
      .to.be.revertedWith("PSM: no fee accrual");
    expect(await usdc.balanceOf(await deployer.getAddress())).to.equal(
      ethers.utils.parseUnits("0.75", 6)
    );
  });
  it("Should not allow depositing over cap of 1 USDC", async () => {
    await usdc.mint(await user.getAddress(), ethers.utils.parseUnits("2", 6));
    await psm.setCollateralCap(
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    );
    await psm.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
   );
    await expect(
      psm.connect(user).deposit(
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
      psm.connect(user).withdraw(
        fxUSD.address,
        usdc.address,
        ethers.utils.parseUnits("10", 18)
     )
    ).to.be.revertedWith("PSM: contract lacks liquidity");
  });
  it("Should not allow withdrawing if there isn't liquidity, and paused", async () => {
    await pauseDeposits();
    await expect(
      psm.connect(user).withdraw(
        fxUSD.address,
        usdc.address,
        ethers.utils.parseUnits("10", 18)
     )
    ).to.be.revertedWith("PSM: paused + no liquidity");
  });
  it("Should remove the peg of USDC to fxUSD", async () => {
    // Try setting the peg.
    await expect(psm.setFxTokenPeg(
      fxUSD.address,
      usdc.address,
      false
    ))
      .to
      .emit(psm, "SetFxTokenPeg")
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
      psm.address,
    )).to.be.false;
  });
});
