import { expect } from 'chai';
import { revertToSnapshotAndCapture, snapshot } from '../../base/test/utils';
import { getDefaultCoreProtocolConfig, setupCoreProtocol } from '../../base/test/utils/setup';
import { Network, ONE_ETH_BI } from '../../base/src/utils/no-deps-constants';
import { createContractWithAbi, createTestToken } from '../../base/src/utils/dolomite-utils';
import {
  OracleAggregatorV2,
  OracleAggregatorV2__factory,
  ChainlinkPriceOracleV3,
  ChainlinkPriceOracleV3__factory,
  TestChainlinkAggregator,
  TestChainlinkAggregator__factory,
} from '../src/types';
import { TokenInfo } from '../src';

describe('OracleAggregatorV2.cycles', () => {
  let snapshotId: string;
  let core: any;
  let aggregator: OracleAggregatorV2;
  let chainlink: ChainlinkPriceOracleV3;
  let agg1: TestChainlinkAggregator;

  before(async () => {
    core = await setupCoreProtocol(await getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    agg1 = await createContractWithAbi<TestChainlinkAggregator>(
      TestChainlinkAggregator__factory.abi,
      TestChainlinkAggregator__factory.bytecode,
      [],
    );
    await agg1.setLatestAnswer(ONE_ETH_BI);
    await agg1.setDecimals(18);
    chainlink = await createContractWithAbi<ChainlinkPriceOracleV3>(
      ChainlinkPriceOracleV3__factory.abi,
      ChainlinkPriceOracleV3__factory.bytecode,
      [core.dolomiteRegistry.address],
    );
    const t1 = await createTestToken();
    const t2 = await createTestToken();
    await chainlink.ownerInsertOrUpdateOracleToken(t1.address, agg1.address, false);
    await chainlink.ownerInsertOrUpdateOracleToken(t2.address, agg1.address, false);

    aggregator = await createContractWithAbi<OracleAggregatorV2>(
      OracleAggregatorV2__factory.abi,
      OracleAggregatorV2__factory.bytecode,
      [[
        { token: t1.address, decimals: 18, oracleInfos: [{ oracle: chainlink.address, tokenPair: t2.address, weight: 100 }] },
        { token: t2.address, decimals: 18, oracleInfos: [{ oracle: chainlink.address, tokenPair: t1.address, weight: 100 }] },
      ] as TokenInfo[], core.dolomiteMargin.address],
    );

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('detects cycle and reverts (expected currently to overflow if not mitigated)', async () => {
    await expect(aggregator.getPrice(core.tokens.usdc.address)).to.be.reverted;
  });
});

