import { expect } from 'chai';
import { setupCoreProtocol } from 'packages/base/test/utils/setup';
import { CoreProtocolArbitrumOne } from 'packages/base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { Network } from 'packages/base/src/utils/no-deps-constants';
import { createContractWithAbi } from 'packages/base/src/utils/dolomite-utils';
import {
  VeExternalVesterImplementationV1__factory,
  VeExternalVesterImplementationV2__factory,
} from '../../src/types';

describe('Fuzz: Vester.lazyInitialize guard', () => {
  let core: CoreProtocolArbitrumOne;

  before(async () => {
    core = await setupCoreProtocol({ network: Network.ArbitrumOne, blockNumber: 219_404_000 });
  });

  it('attacker cannot call lazyInitialize before owner (expected to revert once guard added)', async () => {
    const v1 = await createContractWithAbi(
      VeExternalVesterImplementationV1__factory.abi,
      VeExternalVesterImplementationV1__factory.bytecode,
      [core.dolomiteMargin.address, core.dolomiteRegistry.address, core.testToken.address, 0, core.testToken.address, 0, core.testToken.address, 0],
    );
    // Current behavior: no guard; this will succeed. When guard is added, change to expect revert
    await expect(v1.lazyInitialize(core.hhUser2.address, core.hhUser3.address)).to.not.be.reverted;

    const v2 = await createContractWithAbi(
      VeExternalVesterImplementationV2__factory.abi,
      VeExternalVesterImplementationV2__factory.bytecode,
      [core.dolomiteMargin.address, core.dolomiteRegistry.address, core.testToken.address, 0, core.testToken.address, 0, core.testToken.address, 0],
    );
    await expect(v2.lazyInitialize(core.hhUser2.address, core.hhUser3.address)).to.not.be.reverted;
  });
});

