import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ZERO_ADDRESS } from '@openzeppelin/upgrades/lib/utils/Addresses';
import { getUpgradeableProxyConstructorParams } from '../../base/src/utils/constructors/dolomite';
import { createContractWithAbi } from '../../base/src/utils/dolomite-utils';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { getDefaultCoreProtocolConfig, setupCoreProtocol } from '../../base/test/utils/setup';
import { Network } from '../../base/src/utils/no-deps-constants';
import { UpgradeableProxy, UpgradeableProxy__factory, OARB, OARB__factory } from '../src/types';

describe('UpgradeableProxy - Upgrades and Init', () => {
  let core: CoreProtocolArbitrumOne;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
  });

  it('deploys with initializer and upgrades implementation', async () => {
    const implV1 = await createContractWithAbi<OARB>(OARB__factory.abi, OARB__factory.bytecode, [core.dolomiteMargin.address]);
    const calldata = await implV1.populateTransaction.mint(0);
    const proxy = await createContractWithAbi<UpgradeableProxy>(
      UpgradeableProxy__factory.abi,
      UpgradeableProxy__factory.bytecode,
      getUpgradeableProxyConstructorParams(implV1.address, calldata, core.dolomiteMargin),
    );
    const asOARB = OARB__factory.connect(proxy.address, core.hhUser1);
    expect(await asOARB.DOLOMITE_MARGIN()).to.eq(core.dolomiteMargin.address);

    const implV2 = await createContractWithAbi<OARB>(OARB__factory.abi, OARB__factory.bytecode, [core.dolomiteMargin.address]);
    await proxy.connect(core.governance).upgradeTo(implV2.address);
    expect(await asOARB.DOLOMITE_MARGIN()).to.eq(core.dolomiteMargin.address);
  });
});

