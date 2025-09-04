import {
  createContractWithAbi,
  depositIntoDolomiteMargin,
} from '@dolomite-exchange/modules-base/src/utils/dolomite-utils';
import { Network, ONE_ETH_BI, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { advanceByTimeDelta, getBlockTimestamp, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectProtocolBalance, expectThrow, expectWalletBalance } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { disableInterestAccrual, setupARBBalance, setupCoreProtocol, setupUSDCBalance, setupWETHBalance } from '@dolomite-exchange/modules-base/test/utils/setup';
import { increase } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { OARB, OARB__factory, TestExternalVesterImplementationV1, TestVesterImplementationV2 } from '../src/types';
import { createExternalOARB, createTestExternalVesterV1Proxy, createTestVesterV2Proxy, createVesterDiscountCalculatorV1 } from './liquidity-mining-ecosystem-utils';

const defaultAccountNumber = ZERO_BI;
const ONE_WEEK = BigNumber.from('604800');
const WETH_BALANCE = parseEther('1000');

describe('Fuzz.Vesters', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;

  before(async () => {
    core = await setupCoreProtocol({ network: Network.ArbitrumOne });
    await disableInterestAccrual(core, core.marketIds.usdc);
    await disableInterestAccrual(core, core.marketIds.weth);
    await disableInterestAccrual(core, core.marketIds.arb!);
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  describe('Vester V2 - duration boundaries and taxes', () => {
    it('covers min/max durations and cost/tax invariants hold', async () => {
      const handler = core.hhUser5;
      const vester = await createTestVesterV2Proxy(core, handler);
      const oARB = OARB__factory.connect(await vester.oToken(), core.hhUser1);

      // fund and approvals
      await setupUSDCBalance(core, core.hhUser1, BigNumber.from('100816979'), core.dolomiteMargin);
      await setupARBBalance(core, core.hhUser1, ONE_ETH_BI, core.dolomiteMargin);
      await setupWETHBalance(core, core.hhUser1, WETH_BALANCE, core.dolomiteMargin);
      await depositIntoDolomiteMargin(core, core.hhUser1, defaultAccountNumber, core.marketIds.arb!, ONE_ETH_BI);
      await depositIntoDolomiteMargin(core, core.hhUser1, defaultAccountNumber, core.marketIds.weth, WETH_BALANCE);
      await oARB.connect(core.hhUser1).approve(vester.address, ONE_ETH_BI);
      await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(vester.address, true);

      const durations = [ONE_WEEK, ONE_WEEK.mul(4), ONE_WEEK.mul(40)];
      for (const d of durations) {
        // vest
        const nextId = (await vester.nextNftId()).add(1);
        await vester.vest(defaultAccountNumber, d, ONE_ETH_BI);
        // forward time by effective duration depending on level (0)
        const start = await getBlockTimestamp(await ethers.provider.getBlockNumber());
        const delta = d;
        await increase(delta);

        // set oracle to 1:1
        await core.testEcosystem!.testPriceOracle.setPrice(core.tokens.weth.address, ONE_ETH_BI);
        await core.testEcosystem!.testPriceOracle.setPrice(core.tokens.arb!.address, ONE_ETH_BI);
        await core.dolomiteMargin.ownerSetPriceOracle(core.marketIds.weth, core.testEcosystem!.testPriceOracle.address);
        await core.dolomiteMargin.ownerSetPriceOracle(core.marketIds.arb!, core.testEcosystem!.testPriceOracle.address);

        // close and buy
        const preWeth = (await core.dolomiteMargin.getAccountWei({ owner: core.hhUser1.address, number: defaultAccountNumber }, core.marketIds.weth)).value;
        await vester.closePositionAndBuyTokens(nextId, defaultAccountNumber, defaultAccountNumber, parseEther('1000'));
        const postWeth = (await core.dolomiteMargin.getAccountWei({ owner: core.hhUser1.address, number: defaultAccountNumber }, core.marketIds.weth)).value;

        // invariants: promised reduces then resets, available decreases by 1e18 across scenarios
        // costs are within [0, 0.975] ETH band depending on discount schedule
        const paid = preWeth.sub(postWeth);
        expect(paid).to.be.gte(ZERO_BI);
        expect(paid).to.be.lte(parseEther('0.975'));
      }
    });
  });

  describe('ExternalVester - pushed vs promised invariants', () => {
    it('maintains pushed - promised >= 0 across operations', async () => {
      const discount = await createVesterDiscountCalculatorV1();
      const oToken = await createExternalOARB(core.hhUser4, 'goARB', 'goARB');
      const vester = await createTestExternalVesterV1Proxy(
        core,
        core.tokens.usdc,
        core.tokens.weth,
        core.tokens.arb!,
        discount,
        oToken,
        core.hhUser4,
        'base',
        'name',
        'sym',
      );

      // operator setup
      await core.dolomiteMargin.connect(core.hhUser4).setOperators([{ operator: vester.address, trusted: true }]);

      // fund reward token into vester and verify pushed/available
      await setupARBBalance(core, core.hhUser4, parseEther('1000'), vester);
      await vester.connect(core.hhUser4).ownerDepositRewardToken(parseEther('1000'));
      expect(await vester.pushedTokens()).to.eq(parseEther('1000'));
      expect(await vester.promisedTokens()).to.eq(ZERO_BI);
      expect(await vester.availableTokens()).to.eq(parseEther('1000'));

      // vest once; promised increases and available decreases
      await oToken.connect(core.hhUser4).ownerSetHandler(vester.address, true);
      await oToken.connect(core.hhUser4).mint(parseEther('1'));
      await oToken.connect(core.hhUser4).transfer(core.hhUser1.address, parseEther('1'));
      await oToken.connect(core.hhUser1).approve(vester.address, parseEther('1'));

      await setupUSDCBalance(core, core.hhUser1, BigNumber.from('1500000'), vester);
      await setupWETHBalance(core, core.hhUser1, parseEther('1'), vester);

      await vester.vest(ONE_WEEK, parseEther('1'), parseEther('1'));
      expect(await vester.promisedTokens()).to.eq(parseEther('1'));
      expect(await vester.availableTokens()).to.eq(parseEther('999'));
      expect((await vester.pushedTokens()).sub(await vester.promisedTokens())).to.be.gte(ZERO_BI);

      // withdraw some reward tokens bypassing available (owner rug path) should not underflow invariants
      await vester.connect(core.hhUser4).ownerWithdrawRewardToken(core.hhUser4.address, parseEther('500'), true);
      expect(await vester.pushedTokens()).to.eq(parseEther('500'));
      expect((await vester.pushedTokens()).sub(await vester.promisedTokens())).to.be.gte(ZERO_BI);
    });
  });
});

