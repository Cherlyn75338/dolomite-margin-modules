/* tslint:disable:ter-indent */
/* eslint-disable import/no-extraneous-dependencies */
import '@nomiclabs/hardhat-etherscan';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'hardhat-tracer';
import {
  Network,
  NETWORK_TO_DEFAULT_BLOCK_NUMBER_MAP,
  NetworkName,
} from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/types';
import 'tsconfig-paths/register';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const offline = process.env.OFFLINE_TESTS === 'true' || process.env.OFFLINE === 'true';

function getEnv(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  return fallback;
}

// RPC URLs
const defaultRpc = 'http://127.0.0.1:8545';
const arbitrumOneWeb3Url = getEnv('ARBITRUM_ONE_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!arbitrumOneWeb3Url) throw new Error('No ARBITRUM_ONE_WEB3_PROVIDER_URL provided!');
const baseWeb3Url = getEnv('BASE_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!baseWeb3Url) throw new Error('No BASE_WEB3_PROVIDER_URL provided!');
const berachainWeb3Url = getEnv('BERACHAIN_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!berachainWeb3Url) throw new Error('No BERACHAIN_WEB3_PROVIDER_URL provided!');
const botanixWeb3Url = getEnv('BOTANIX_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!botanixWeb3Url) throw new Error('No BOTANIX_WEB3_PROVIDER_URL provided!');
const ethereumWeb3Url = getEnv('ETHEREUM_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!ethereumWeb3Url) throw new Error('No ETHEREUM_WEB3_PROVIDER_URL provided!');
const inkWeb3Url = getEnv('INK_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!inkWeb3Url) throw new Error('No INK_WEB3_PROVIDER_URL provided!');
const mantleWeb3Url = getEnv('MANTLE_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!mantleWeb3Url) throw new Error('No MANTLE_WEB3_PROVIDER_URL provided!');
const polygonZkEvmWeb3Url = getEnv('POLYGON_ZKEVM_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!polygonZkEvmWeb3Url) throw new Error('No POLYGON_ZKEVM_WEB3_PROVIDER_URL provided!');
const superSeedWeb3Url = getEnv('SUPER_SEED_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!superSeedWeb3Url) throw new Error('No SUPER_SEED_WEB3_PROVIDER_URL provided!');
const xLayerWeb3Url = getEnv('X_LAYER_WEB3_PROVIDER_URL', offline ? defaultRpc : undefined);
if (!xLayerWeb3Url) throw new Error('No X_LAYER_WEB3_PROVIDER_URL provided!');

// Block Explorer API Keys
const arbiscanApiKey = getEnv('ARBISCAN_API_KEY', offline ? 'dummy' : undefined);
if (!arbiscanApiKey) throw new Error('No ARBISCAN_API_KEY provided!');
const basescanApiKey = getEnv('BASESCAN_API_KEY', offline ? 'dummy' : undefined);
if (!basescanApiKey) throw new Error('No BASESCAN_API_KEY provided!');
const berascanApiKey = getEnv('BERASCAN_API_KEY', offline ? 'dummy' : undefined);
if (!berascanApiKey) throw new Error('No BERASCAN_API_KEY provided!');
const botanixApiKey = getEnv('BOTANIX_API_KEY', offline ? 'dummy' : undefined);
if (!botanixApiKey) throw new Error('No BOTANIX_API_KEY provided!');
const etherscanApiKey = getEnv('ETHERSCAN_API_KEY', offline ? 'dummy' : undefined);
if (!etherscanApiKey) throw new Error('No ETHERSCAN_API_KEY provided!');
const inkscanApiKey = getEnv('INKSCAN_API_KEY', offline ? 'dummy' : undefined);
if (!inkscanApiKey) throw new Error('No INKSCAN_API_KEY provided!');
const mantlescanApiKey = getEnv('MANTLESCAN_API_KEY', offline ? 'dummy' : undefined);
if (!mantlescanApiKey) throw new Error('No MANTLESCAN_API_KEY provided!');
const polygonscanApiKey = getEnv('POLYGONSCAN_API_KEY', offline ? 'dummy' : undefined);
if (!polygonscanApiKey) throw new Error('No POLYGONSCAN_API_KEY provided!');
const superscanApiKey = getEnv('SUPERSCAN_API_KEY', offline ? 'dummy' : undefined);
if (!superscanApiKey) throw new Error('No SUPERSCAN_API_KEY provided!');
const xLayerApiKey = getEnv('X_LAYER_API_KEY', offline ? 'dummy' : undefined);
if (!xLayerApiKey) throw new Error('No X_LAYER_API_KEY provided!');

const contractsDirectory = process.env.COVERAGE === 'true' ? './contracts_coverage' : './contracts';
export const base_config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: 80_000_000,
      blockGasLimit: 100000000429720,
      chainId: parseInt(Network.Berachain, 10),
      chains: {
        [Network.PolygonZkEvm]: {
          hardforkHistory: {
            berlin: NETWORK_TO_DEFAULT_BLOCK_NUMBER_MAP[Network.PolygonZkEvm] - 1,
          },
        },
      },
    },
    [NetworkName.ArbitrumOne]: {
      chainId: parseInt(Network.ArbitrumOne, 10),
      url: arbitrumOneWeb3Url,
      gas: 30_000_000, // 30M gas
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    [NetworkName.Base]: {
      chainId: parseInt(Network.Base, 10),
      url: baseWeb3Url,
      gas: 20_000_000, // 20M gas
      gasPrice: 30_000_000, // 0.03 gwei
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    [NetworkName.Berachain]: {
      chainId: parseInt(Network.Berachain, 10),
      url: berachainWeb3Url,
      gas: 20_000_000, // 20M gas
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    [NetworkName.Botanix]: {
      chainId: parseInt(Network.Botanix, 10),
      url: botanixWeb3Url,
      gas: 15_000_000, // 15M gas
      gasPrice: 800_000, // 0.0008 gwei
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    [NetworkName.Ethereum]: {
      chainId: parseInt(Network.Ethereum, 10),
      url: ethereumWeb3Url,
      gas: 15_000_000, // 15M gas
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    [NetworkName.Ink]: {
      chainId: parseInt(Network.Ink, 10),
      url: inkWeb3Url,
      gas: 30_000_000, // 30M gas
      gasPrice: 30_000_000, // 0.03 gwei
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    [NetworkName.Mantle]: {
      chainId: parseInt(Network.Mantle, 10),
      url: mantleWeb3Url,
      gas: 25_000_000_000, // 25B gas
      gasPrice: 30_000_000, // 0.03 gwei
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    [NetworkName.PolygonZkEvm]: {
      chainId: parseInt(Network.PolygonZkEvm, 10),
      url: polygonZkEvmWeb3Url,
      gas: 20_000_000, // 20M gas
      gasPrice: 30_000_000, // 0.03 gwei
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    [NetworkName.SuperSeed]: {
      chainId: parseInt(Network.SuperSeed, 10),
      url: superSeedWeb3Url,
      gas: 30_000_000, // 30M gas
      gasPrice: 30_000_000, // 0.03 gwei
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    [NetworkName.XLayer]: {
      chainId: parseInt(Network.XLayer, 10),
      url: xLayerWeb3Url,
      gas: 25_000_000, // 25M gas
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.8.9',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
            details: {
              yul: false, // To fix some extraneous "stack too deep" errors that don't make sense, set this to false.
            },
          },
        },
      },
    ],
  },
  paths: {
    sources: contractsDirectory,
  },
  mocha: {
    timeout: 2000000,
    // parallel: process.env.TEST_SPECIFIC !== 'true',
    // jobs: 2,
    slow: 60000,
    asyncOnly: true,
    // retries: process.env.COVERAGE === 'true' ? 2 : 0,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
  },
  typechain: {
    outDir: 'src/types',
    target: 'ethers-v5',
    alwaysGenerateOverloads: false,
  },
  etherscan: {
    apiKey: {
      [NetworkName.ArbitrumOne]: arbiscanApiKey,
      [NetworkName.Base]: basescanApiKey,
      [NetworkName.Berachain]: berascanApiKey,
      [NetworkName.Botanix]: botanixApiKey,
      [NetworkName.Ethereum]: etherscanApiKey,
      [NetworkName.Ink]: inkscanApiKey,
      [NetworkName.Mantle]: mantlescanApiKey,
      [NetworkName.PolygonZkEvm]: polygonscanApiKey,
      [NetworkName.SuperSeed]: superscanApiKey,
      [NetworkName.XLayer]: xLayerApiKey,
    },
    customChains: [
      {
        network: NetworkName.ArbitrumOne,
        chainId: parseInt(Network.ArbitrumOne, 10),
        urls: {
          apiURL: 'https://api.arbiscan.io/api',
          browserURL: 'https://arbiscan.io',
        },
      },
      {
        network: NetworkName.Base,
        chainId: parseInt(Network.Base, 10),
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org/',
        },
      },
      {
        network: NetworkName.Berachain,
        chainId: parseInt(Network.Berachain, 10),
        urls: {
          apiURL: 'https://api.berascan.com/api',
          browserURL: 'https://berascan.com',
        },
      },
      {
        network: NetworkName.Botanix,
        chainId: parseInt(Network.Botanix, 10),
        urls: {
          apiURL: 'https://api.routescan.io/v2/network/mainnet/evm/3637/etherscan/api',
          browserURL: 'https://botanixscan.io',
        },
      },
      {
        network: NetworkName.Ethereum,
        chainId: parseInt(Network.Ethereum, 10),
        urls: {
          apiURL: 'https://api.etherscan.io/api',
          browserURL: 'https://etherscan.io',
        },
      },
      {
        network: NetworkName.Ink,
        chainId: parseInt(Network.Ink, 10),
        urls: {
          apiURL: 'https://explorer.inkonchain.com/api',
          browserURL: 'https://explorer.inkonchain.com',
        },
      },
      {
        network: NetworkName.Mantle,
        chainId: parseInt(Network.Mantle, 10),
        urls: {
          apiURL: 'https://api.mantlescan.xyz/api',
          browserURL: 'https://mantlescan.xyz',
        },
      },
      {
        network: NetworkName.PolygonZkEvm,
        chainId: parseInt(Network.PolygonZkEvm, 10),
        urls: {
          apiURL: 'https://api-zkevm.polygonscan.com/api',
          browserURL: 'https://zkevm.polygonscan.com',
        },
      },
      {
        network: NetworkName.SuperSeed,
        chainId: parseInt(Network.SuperSeed, 10),
        urls: {
          apiURL: 'https://explorer.superseed.xyz/api',
          browserURL: 'https://explorer.superseed.xyz',
        },
      },
      {
        network: NetworkName.XLayer,
        chainId: parseInt(Network.XLayer, 10),
        urls: {
          apiURL: 'https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER',
          browserURL: 'https://www.oklink.com/xlayer/',
        },
      },
    ],
  },
  tracer: {
    tasks: ['run'],
  },
};
