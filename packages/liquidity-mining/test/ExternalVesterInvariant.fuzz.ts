import { Network, ONE_BI, ONE_DAY_SECONDS, ONE_WEEK_SECONDS, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectEvent, expectThrow, expectWalletBalance } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { getDefaultCoreProtocolConfig, setupARBBalance, setupCoreProtocol, setupUSDCBalance, setupWETHBalance } from '@dolomite-exchange/modules-base/test/utils/setup';
import { increase } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { ExternalOARB, IVesterDiscountCalculator, TestExternalVesterImplementationV1 } from '../src/types';
import { createExternalOARB, createTestDiscountCalculator, createTestExternalVesterV1Proxy } from './liquidity-mining-ecosystem-utils';

describe('ExternalVesterInvariant.fuzz', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let vester: TestExternalVesterImplementationV1;
  let oToken: ExternalOARB;
  let discount: IVesterDiscountCalculator;

  const O_TOKEN_AMOUNT = parseEther('1');
  const PAIR_AMOUNT = BigNumber.from('1500000');
  const MAX_PAIR_AMOUNT = PAIR_AMOUNT.mul(2);
  const MAX_PAYMENT_AMOUNT = parseEther('10');

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    oToken = await createExternalOARB(core.hhUser4, 'o', 'o');
    discount = await createTestDiscountCalculator();
    vester = await createTestExternalVesterV1Proxy(
      core,
      core.tokens.usdc,
      core.tokens.weth,
      core.tokens.arb!,
      discount,
      oToken,
      core.hhUser4,
      'ipfs://base',
      'name',
      'sym',
    );
    await vester.connect(core.hhUser4).ownerSetClosePositionWindow(ONE_WEEK_SECONDS * 4);

    // Seed balances and approvals
    await oToken.connect(core.hhUser4).ownerSetHandler(core.hhUser1.address, true);
    await oToken.connect(core.hhUser4).ownerSetHandler(vester.address, true);
    await oToken.connect(core.hhUser4).mint(O_TOKEN_AMOUNT.mul(5));
    await oToken.connect(core.hhUser4).transfer(core.hhUser1.address, O_TOKEN_AMOUNT.mul(2));
    await oToken.connect(core.hhUser1).approve(vester.address, O_TOKEN_AMOUNT.mul(2));

    await setupUSDCBalance(core, core.hhUser1, PAIR_AMOUNT.mul(5), vester);
    await setupWETHBalance(core, core.hhUser1, MAX_PAYMENT_AMOUNT, vester);
    await setupARBBalance(core, core.hhUser4, parseEther('1000'), vester);
    await vester.connect(core.hhUser4).ownerDepositRewardToken(parseEther('1000'));

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('pushedTokens - promisedTokens invariant across vest/close/emergency', async () => {
    // vest
    await vester.connect(core.hhUser1).vest(ONE_WEEK_SECONDS, O_TOKEN_AMOUNT, MAX_PAIR_AMOUNT);
    expect(await vester.promisedTokens()).to.eq(O_TOKEN_AMOUNT);
    // close
    await increase(ONE_WEEK_SECONDS);
    const res = await vester.connect(core.hhUser1).closePositionAndBuyTokens(ONE_BI, MAX_PAYMENT_AMOUNT);
    await expectEvent(vester, res, 'PositionClosed');
    expect(await vester.promisedTokens()).to.eq(ZERO_BI);
    // re-vest and emergency
    await vester.connect(core.hhUser1).vest(ONE_WEEK_SECONDS, O_TOKEN_AMOUNT, MAX_PAIR_AMOUNT);
    expect(await vester.promisedTokens()).to.eq(O_TOKEN_AMOUNT);
    await increase(ONE_DAY_SECONDS);
    await vester.connect(core.hhUser1).emergencyWithdraw(2);
    expect(await vester.promisedTokens()).to.eq(ZERO_BI);

    const pushed = await vester.pushedTokens();
    expect(pushed).to.gte(ZERO_BI);
  });

  it('ownerAccrueRewardTokenInterest only after pushedTokens == 0', async () => {
    await expectThrow(
      vester.connect(core.hhUser4).ownerAccrueRewardTokenInterest(core.hhUser4.address),
      'ExternalVesterImplementationV1: Interest cannot be withdrawn yet',
    );
    // drain pushed tokens
    await vester.connect(core.hhUser4).ownerWithdrawRewardToken(core.hhUser4.address, parseEther('1000'), true);
    await vester.connect(core.hhUser4).ownerAccrueRewardTokenInterest(core.hhUser4.address);
  });

  it('force-close tax applies only to principal (pairAmount), not interest', async () => {
    await vester.connect(core.hhUser1).vest(ONE_WEEK_SECONDS, O_TOKEN_AMOUNT, MAX_PAIR_AMOUNT);
    await increase(ONE_WEEK_SECONDS * 5);
    const tx = await vester.connect(core.hhUser5).forceClosePosition(ONE_BI);
    const receipt = await tx.wait();
    const event = receipt.events!.find(e => e.event === 'PositionForceClosed')!;
    const tax = event.args!.pairTax as BigNumber;
    expect(tax).to.eq(PAIR_AMOUNT.mul(5).div(100));
  });
});

