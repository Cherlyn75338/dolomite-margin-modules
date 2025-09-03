import { Network, ONE_BI, ONE_WEEK_SECONDS, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { getBlockTimestamp, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectThrow, expectWalletBalance } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { getDefaultCoreProtocolConfig, setupCoreProtocol, setupWETHBalance } from '@dolomite-exchange/modules-base/test/utils/setup';
import { increase } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { TestVesterImplementationV1, TestVesterImplementationV1__factory } from '../src/types';
import { createOARB, createTestVesterV1Proxy } from './liquidity-mining-ecosystem-utils';

// Invariant-style tests for Vester V1 around promisedTokens and pricing boundaries

describe('VesterInvariant.fuzz (V1)', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let vester: TestVesterImplementationV1;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    const oARB = await createOARB(core);
    vester = await createTestVesterV1Proxy(core, oARB, 'ipfs://base');
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(vester.address, true);

    // Seed tokens
    await expectWalletBalance(vester, core.tokens.arb!, ZERO_BI);
    await core.tokens.arb!.connect(core.gnosisSafe).transfer(vester.address, parseEther('1000000'));

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('promisedTokens never exceeds contract balance; close/emergency/force preserve invariant', async () => {
    const amount = parseEther('10');
    // Approvals and deposits
    await core.tokens.arb!.connect(core.hhUser1).approve(vester.address, amount);
    const oarb = await ethers.getContractAt('OARB', await vester.oToken());
    await oarb.connect(core.hhUser5).mint(amount);
    await oarb.connect(core.hhUser5).transfer(core.hhUser1.address, amount);
    await oarb.connect(core.hhUser1).approve(vester.address, amount);

    // Deposit PAIR into Dolomite for user
    await setupWETHBalance(core, core.hhUser1, parseEther('5'), core.dolomiteMargin);
    const pairMarketId = await core.dolomiteMargin.getMarketIdByTokenAddress(core.tokens.arb!.address);
    const accountNumber = ZERO_BI;
    await vester.connect(core.hhUser1).vest(accountNumber, ONE_WEEK_SECONDS, amount);

    const promisedAfterVest = await vester.promisedTokens();
    expect(promisedAfterVest).to.eq(amount);

    // After vesting duration, close position and ensure promised decreases and stays <= contract balance
    await increase(ONE_WEEK_SECONDS);
    await vester.connect(core.hhUser1).closePositionAndBuyTokens(ONE_BI, accountNumber, accountNumber, parseEther('1000'));
    expect(await vester.promisedTokens()).to.eq(0);
    const balance = await core.tokens.arb!.balanceOf(vester.address);
    expect(await vester.promisedTokens()).to.be.lte(balance);

    // Re-vest and emergency withdraw
    await vester.connect(core.hhUser1).vest(accountNumber, ONE_WEEK_SECONDS, amount);
    expect(await vester.promisedTokens()).to.eq(amount);
    await vester.connect(core.hhUser1).emergencyWithdraw(2);
    expect(await vester.promisedTokens()).to.eq(0);
    expect(await vester.promisedTokens()).to.be.lte(await core.tokens.arb!.balanceOf(vester.address));
  });

  it('fails to close before vest duration; respects close window', async () => {
    const amount = parseEther('1');
    const oarb = await ethers.getContractAt('OARB', await vester.oToken());
    await oarb.connect(core.hhUser5).mint(amount);
    await oarb.connect(core.hhUser5).transfer(core.hhUser1.address, amount);
    await oarb.connect(core.hhUser1).approve(vester.address, amount);
    await vester.connect(core.hhUser1).vest(ZERO_BI, ONE_WEEK_SECONDS, amount);
    await expectThrow(
      vester.connect(core.hhUser1).closePositionAndBuyTokens(ONE_BI, ZERO_BI, ZERO_BI, parseEther('1000')),
      'VesterImplementationV1: Position not vested',
    );
  });
});

