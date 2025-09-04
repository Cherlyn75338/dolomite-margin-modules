import { expect } from 'chai';
import { ethers } from 'hardhat';
import { setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import {
  MockDolomiteMargin,
  MockDolomiteMargin__factory,
  TestEmitterMultipleRewardTokensHarness,
  TestEmitterMultipleRewardTokensHarness__factory,
  NonCompliantMintableERC20,
  NonCompliantMintableERC20__factory,
  MintableStorageVault,
  MintableStorageVault__factory,
} from '../src/types';

describe('EmitterMultipleRewardTokens Minimal Vulnerability Tests', () => {
  let mockDM: MockDolomiteMargin;
  let emitter: TestEmitterMultipleRewardTokensHarness;
  let startTime: number;

  const alloc = ethers.utils.parseUnits('100', 0);
  const marketId = 1;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();
    mockDM = await new MockDolomiteMargin__factory(deployer).deploy(deployer.address);
    startTime = (await ethers.provider.getBlock('latest'))!.timestamp + 200;
    emitter = await new TestEmitterMultipleRewardTokensHarness__factory(deployer).deploy(
      mockDM.address,
      deployer.address,
      ethers.utils.parseEther('1'),
      startTime,
    );
  });

  it('starves second token accrual due to early return when supply == 0', async () => {
    const [deployer] = await ethers.getSigners();
    const token1 = await new NonCompliantMintableERC20__factory(deployer).deploy();
    const token2 = await new NonCompliantMintableERC20__factory(deployer).deploy();
    await emitter.ownerAddRewardToken(token1.address, ethers.constants.AddressZero, true);
    await emitter.ownerAddRewardToken(token2.address, ethers.constants.AddressZero, true);
    await emitter.ownerAddPool(marketId, alloc, false);

    await setNextBlockTimestamp(startTime + 10);
    await emitter.updatePool(marketId);

    const last1 = await emitter.poolLastRewardTime(marketId, token1.address);
    const last2 = await emitter.poolLastRewardTime(marketId, token2.address);
    expect(last1).to.eq(startTime + 10);
    expect(last2).to.eq(startTime);
  });

  it('skips second token when first token lastRewardTime >= now', async () => {
    const [deployer] = await ethers.getSigners();
    const token1 = await new NonCompliantMintableERC20__factory(deployer).deploy();
    const token2 = await new NonCompliantMintableERC20__factory(deployer).deploy();
    await emitter.ownerAddRewardToken(token1.address, ethers.constants.AddressZero, true);
    await emitter.ownerAddRewardToken(token2.address, ethers.constants.AddressZero, true);
    await emitter.ownerAddPool(marketId, alloc, false);

    await setNextBlockTimestamp(startTime + 5);
    await emitter.updatePool(marketId);
    await emitter.updatePool(marketId);

    const last1 = await emitter.poolLastRewardTime(marketId, token1.address);
    const last2 = await emitter.poolLastRewardTime(marketId, token2.address);
    expect(last1).to.be.gte(startTime + 5);
    expect(last2).to.eq(startTime);
  });

  it('reverts due to division by zero when totalAllocPoint == 0 and supply > 0', async () => {
    const [deployer] = await ethers.getSigners();
    const token1 = await new NonCompliantMintableERC20__factory(deployer).deploy();
    await emitter.ownerAddRewardToken(token1.address, ethers.constants.AddressZero, true);
    await emitter.ownerAddPool(marketId, /* allocPoint */ 0, false);
    await emitter.harnessSetPoolTotalPar(marketId, ethers.utils.parseEther('1'));
    await setNextBlockTimestamp(startTime + 1);
    await expect(emitter.updatePool(marketId)).to.be.reverted;
  });

  it('unchecked transfer silently strands rewards in vault (transfer to emitter fails)', async () => {
    const [deployer, user] = await ethers.getSigners();
    const badToken = await new NonCompliantMintableERC20__factory(deployer).deploy();
    const badVault = await new MintableStorageVault__factory(deployer).deploy(mockDM.address, badToken.address as any);
    await mockDM.ownerSetGlobalOperator(emitter.address, true);
    await mockDM.ownerSetGlobalOperator(badVault.address, true);

    await emitter.ownerAddRewardToken(badToken.address, badVault.address, true);
    await emitter.ownerAddPool(marketId, alloc, false);

    await emitter.harnessSetUserAmount(marketId, user.address, ethers.utils.parseEther('1'));
    await emitter.harnessSetUserRewardDebt(marketId, user.address, badToken.address, 0);
    await emitter.harnessSetPoolAccPerShare(marketId, badToken.address, ethers.utils.parseEther('1'));
    await emitter.harnessSetPoolTotalPar(marketId, ethers.utils.parseEther('1'));
    await setNextBlockTimestamp(startTime + 1);
    await emitter.connect(user).harnessPayRewardForToken(marketId, badToken.address);

    expect(await badToken.balanceOf(user.address)).to.eq(0);
    // Vault minted tokens to itself; transfer to emitter failed (returns false), so tokens remain at vault
    expect(await badToken.balanceOf(badVault.address)).to.eq(ethers.utils.parseEther('1'));
  });
});

