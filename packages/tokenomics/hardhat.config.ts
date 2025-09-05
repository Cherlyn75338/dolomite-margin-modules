/* eslint-disable import/no-extraneous-dependencies */
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-solhint';
import '@nomiclabs/hardhat-vyper';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';

import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import 'hardhat-gas-reporter';
import 'solidity-coverage';

import 'tsconfig-paths/register';
import type { HardhatUserConfig } from 'hardhat/types';

chai.use(solidity);
if (process.env.COVERAGE !== 'true') {
  require('hardhat-tracer');
}

const contractsDirectory = process.env.COVERAGE === 'true' ? './contracts_coverage' : './contracts';

const offlineConfig: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: 80_000_000,
      blockGasLimit: 100000000429720,
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.8.9',
        settings: {
          optimizer: { enabled: true, runs: 200, details: { yul: false } },
        },
      },
    ],
  },
  paths: { sources: contractsDirectory },
  mocha: { timeout: 2_000_000, slow: 60_000, asyncOnly: true },
  gasReporter: { enabled: process.env.REPORT_GAS === 'true' },
  typechain: { outDir: 'src/types', target: 'ethers-v5', alwaysGenerateOverloads: false },
};

// Prefer offline config unless explicitly disabled
let cfg: HardhatUserConfig = offlineConfig;
if (process.env.OFFLINE_TESTS !== 'true') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cfg = require('../../hardhat-base-config').base_config;
  } catch (e) {
    cfg = offlineConfig;
  }
}

// noinspection JSUnusedGlobalSymbols
export default cfg;
