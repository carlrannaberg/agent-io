import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

export interface IntegrationSetupResults {
  buildPassed: boolean;
  typecheckPassed: boolean;
  lintPassed: boolean;
  testsPassed: boolean;
  buildTime: number;
}

let setupComplete = false;
let setupResults: IntegrationSetupResults | null = null;
let setupPromise: Promise<IntegrationSetupResults> | null = null;

/**
 * Shared setup helper for integration tests
 * Runs expensive operations once and caches results across all integration tests
 */
export async function getSharedSetup(): Promise<IntegrationSetupResults> {
  // Return cached results if setup is complete
  if (setupComplete && setupResults) {
    return setupResults;
  }
  
  // If setup is in progress, wait for it to complete
  if (setupPromise) {
    return await setupPromise;
  }
  
  // Start setup process and cache the promise
  setupPromise = performSetup();
  return await setupPromise;
}

async function performSetup(): Promise<IntegrationSetupResults> {

  const rootDir = join(__dirname, '../..');
  const startTime = Date.now();
  
  setupResults = {
    buildPassed: false,
    typecheckPassed: false,
    lintPassed: false,
    testsPassed: false,
    buildTime: 0
  };

  try {
    // Run build once - this is the most expensive operation
    // eslint-disable-next-line no-console
    console.log('🏗️  Running shared build for integration tests...');
    execSync('npm run build:packages', {
      cwd: rootDir,
      stdio: 'pipe',
      timeout: 120000
    });
    
    setupResults.buildPassed = true;
    setupResults.buildTime = Date.now() - startTime;
    
    // If build passes, TypeScript must have passed too
    setupResults.typecheckPassed = true;
    
    // Test linting configuration
    try {
      execSync('npm run lint', {
        cwd: rootDir,
        stdio: 'pipe',
        timeout: 30000
      });
      setupResults.lintPassed = true;
    } catch (lintError) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  Linting failed but continuing tests');
      setupResults.lintPassed = false;
    }
    
    // Verify build artifacts exist
    const packages = ['core', 'jsonl', 'stream', 'invoke'];
    const allBuilt = packages.every(pkg => {
      const distPath = join(rootDir, 'packages', pkg, 'dist');
      return existsSync(distPath);
    });
    
    if (!allBuilt) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  Not all packages built successfully');
      setupResults.buildPassed = false;
    }

    // eslint-disable-next-line no-console
    console.log(`✅ Shared setup completed in ${setupResults.buildTime}ms`);
    
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Shared setup failed:', error);
    setupResults.buildPassed = false;
    setupResults.typecheckPassed = false;
  }

  setupComplete = true;
  setupPromise = null; // Clear the promise since we're done
  return setupResults;
}

/**
 * Reset the shared setup (useful for testing)
 */
export function resetSharedSetup(): void {
  setupComplete = false;
  setupResults = null;
  setupPromise = null;
}

/**
 * Get package directories
 */
export function getPackages(): string[] {
  return ['core', 'jsonl', 'stream', 'invoke'];
}

/**
 * Get root directory
 */
export function getRootDir(): string {
  return join(__dirname, '../..');
}