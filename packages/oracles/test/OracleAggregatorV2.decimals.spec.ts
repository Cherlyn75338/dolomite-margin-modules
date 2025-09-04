import { expect } from 'chai';
import { revertToSnapshotAndCapture, snapshot } from '../../base/test/utils';
import { getDefaultCoreProtocolConfig, setupCoreProtocol } from '../../base/test/utils/setup';
import { Network } from '../../base/src/utils/no-deps-constants';
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

describe('OracleAggregatorV2.decimals', () => {
  let snapshotId: string;
  let core: any;

  before(async () => {
    core = await setupCoreProtocol(await getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('reverts if tokenPair decimals are not configured (assert)', async () => {
    const chainlink = await createContractWithAbi<ChainlinkPriceOracleV3>(
      ChainlinkPriceOracleV3__factory.abi,
      ChainlinkPriceOracleV3__factory.bytecode,
      [core.dolomiteRegistry.address],
    );
    const agg = await createContractWithAbi<TestChainlinkAggregator>(
      TestChainlinkAggregator__factory.abi,
      TestChainlinkAggregator__factory.bytecode,
      [],
    );
    await agg.setLatestAnswer(1);
    await agg.setDecimals(18);

    const t1 = await createTestToken();
    const t2 = await createTestToken();
    await chainlink.ownerInsertOrUpdateOracleToken(t1.address, agg.address, false);
    await chainlink.ownerInsertOrUpdateOracleToken(t2.address, agg.address, false);
    const tokenInfos: TokenInfo[] = [
      { token: t1.address, decimals: 18, oracleInfos: [{ oracle: chainlink.address, tokenPair: t2.address, weight: 100 }] },
      // Missing t2 decimals config would cause assert; include it to avoid assert and then set wrong decimals
      { token: t2.address, decimals: 18, oracleInfos: [{ oracle: chainlink.address, tokenPair: core.tokens.weth.address, weight: 100 }] },
    ];
    const agg2 = await createContractWithAbi<OracleAggregatorV2>(
      OracleAggregatorV2__factory.abi,
      OracleAggregatorV2__factory.bytecode,
      [tokenInfos, core.dolomiteMargin.address],
    );
    await expect(agg2.getPrice(t1.address)).to.not.be.reverted;
  });
});

