import { ADDRESS_ZERO, MAX_UINT_256_BI, Network, ONE_BI, ONE_ETH_BI, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { getBlockTimestamp, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectProtocolBalance, expectWalletBalance } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { getDefaultCoreProtocolConfig, setupARBBalance, setupCoreProtocol, setupUSDCBalance, setupWETHBalance } from '@dolomite-exchange/modules-base/test/utils/setup';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { ExternalOARB, IERC20, IVesterDiscountCalculator, TestExternalVesterImplementationV1 } from '../src/types';
import { createExternalOARB, createTestDiscountCalculator, createTestExternalVesterV1Proxy } from './liquidity-mining-ecosystem-utils';

const defaultAccountNumber = ZERO_BI;
const ONE_WEEK = BigNumber.from('604800');
const CLOSE_POSITION_WINDOW = ONE_WEEK.mul(4);

const OTOKEN = parseEther('1');
const PAIR = BigNumber.from('1500000');
const PAYMENT_MAX = parseEther('0.002');
const REWARD_TOTAL = parseEther('100');

xdescribe('ExternalVesterV1 - Invariants', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let vester: TestExternalVesterImplementationV1;
  let discount: IVesterDiscountCalculator;
  let oToken: ExternalOARB;
  let pair: IERC20; let payment: IERC20; let reward: IERC20;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    pair = core.tokens.usdc; payment = core.tokens.weth; reward = core.tokens.arb;
    discount = await createTestDiscountCalculator();
    oToken = await createExternalOARB(core.hhUser1, 'goARB', 'goARB');
    vester = await createTestExternalVesterV1Proxy(
      core, pair, payment, reward, discount, oToken, core.hhUser1, 'BASE', 'NAME', 'SYM',
    );
    await vester.connect(core.hhUser1).ownerSetClosePositionWindow(CLOSE_POSITION_WINDOW);
    await core.dolomiteMargin.connect(core.hhUser1).setOperators([{ operator: vester.address, trusted: true }]);
    await oToken.connect(core.hhUser1).ownerSetHandler(core.hhUser1.address, true);
    await oToken.connect(core.hhUser1).ownerSetHandler(vester.address, true);

    await setupUSDCBalance(core, core.hhUser1, PAIR.mul(10), vester);
    await setupWETHBalance(core, core.hhUser1, PAYMENT_MAX.mul(10), vester);
    await setupARBBalance(core, core.hhUser1, REWARD_TOTAL, vester);
    await vester.connect(core.hhUser1).ownerDepositRewardToken(REWARD_TOTAL);
    await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(await snapshot());
  });

  it('maintains pushedTokens >= promisedTokens across vest/close/emergency', async () => {
    const t0 = (await getBlockTimestamp(await ethers.provider.getBlockNumber()));
    await oToken.connect(core.hhUser1).mint(OTOKEN.mul(2));
    await oToken.connect(core.hhUser1).approve(vester.address, MAX_UINT_256_BI);

    const id = await vester.connect(core.hhUser1).callStatic.vest(
      defaultAccountNumber, /* duration */ ONE_WEEK.mul(4), PAIR, OTOKEN, PAYMENT_MAX,
    );
    await vester.connect(core.hhUser1).vest(defaultAccountNumber, ONE_WEEK.mul(4), PAIR, OTOKEN, PAYMENT_MAX);

    const promised1 = await vester.promisedTokens();
    const pushed1 = await vester.pushedTokens();
    expect(pushed1.gte(promised1)).to.eq(true);

    // emergency withdraw burns oToken; reduces promised
    await vester.connect(core.hhUser1).emergencyWithdraw(id);
    const promised2 = await vester.promisedTokens();
    const pushed2 = await vester.pushedTokens();
    expect(pushed2.gte(promised2)).to.eq(true);

    // vest instantly (if supported) or vest+close after time
    await oToken.connect(core.hhUser1).mint(OTOKEN);
    await vester.connect(core.hhUser1).vest(defaultAccountNumber, ONE_WEEK.mul(4), PAIR, OTOKEN, PAYMENT_MAX);
    // simulate expiry
    await ethers.provider.send('evm_setNextBlockTimestamp', [t0 + ONE_WEEK.mul(9).toNumber()]);
    await vester.connect(core.hhUser1).closePositionAndBuyTokens(ONE_BI.add(1), defaultAccountNumber, defaultAccountNumber, MAX_UINT_256_BI);

    const promised3 = await vester.promisedTokens();
    const pushed3 = await vester.pushedTokens();
    expect(pushed3.gte(promised3)).to.eq(true);
  });
});

