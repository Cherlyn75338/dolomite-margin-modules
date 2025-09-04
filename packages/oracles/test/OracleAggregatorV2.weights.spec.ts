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

describe('OracleAggregatorV2.weights', () => {
  let snapshotId: string;
  let core: any;

  before(async () => {
    core = await setupCoreProtocol(await getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('reverts on invalid weights sum', async () => {
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
    await agg.setLatestAnswer(ONE_ETH_BI);
    await agg.setDecimals(18);
    const t = await createTestToken();
    await chainlink.ownerInsertOrUpdateOracleToken(t.address, agg.address, false);
    const infos: TokenInfo[] = [
      { token: t.address, decimals: 18, oracleInfos: [
        { oracle: chainlink.address, tokenPair: core.tokens.weth.address, weight: 75 },
        { oracle: chainlink.address, tokenPair: core.tokens.weth.address, weight: 50 },
      ] },
    ];
    await expect(createContractWithAbi<OracleAggregatorV2>(
      OracleAggregatorV2__factory.abi,
      OracleAggregatorV2__factory.bytecode,
      [infos, core.dolomiteMargin.address],
    )).to.be.revertedWith('OracleAggregatorV2: Invalid weights');
  });
});

