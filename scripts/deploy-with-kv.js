#!/usr/bin/env node

/**
 * Deployment script that ensures KV storage is populated before deploying
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ICON_CATALOG_PATH = path.join(__dirname, '../src/data/icon-catalog.json');

function runCommand(command, description) {
	console.log(`\n🔄 ${description}...`);
	try {
		const output = execSync(command, { encoding: 'utf8' });
		console.log(`✅ ${description} completed successfully`);
		return output;
	} catch (error) {
		console.error(`❌ ${description} failed:`, error.message);
		process.exit(1);
	}
}

function main() {
	console.log('🚀 Starting deployment with KV storage initialization...\n');

	// 1. Check if icon catalog exists
	if (!fs.existsSync(ICON_CATALOG_PATH)) {
		console.error('❌ Icon catalog not found at:', ICON_CATALOG_PATH);
		process.exit(1);
	}

	const iconCatalog = JSON.parse(fs.readFileSync(ICON_CATALOG_PATH, 'utf8'));
	console.log(`📊 Found ${iconCatalog.icons.length} icons in catalog`);

	// 2. Create KV namespaces if they don't exist
	console.log('\n📦 Setting up KV namespaces...');
	
	try {
		// Check if production namespace exists
		const existingNamespaces = execSync('wrangler kv:namespace list', { encoding: 'utf8' });
		const namespaces = JSON.parse(existingNamespaces);
		
		let productionId = namespaces.find(ns => ns.title === 'mcp-server-remix-icon-icon_catalog_production')?.id;
		let previewId = namespaces.find(ns => ns.title === 'mcp-server-remix-icon-icon_catalog_preview')?.id;
		
		if (!productionId) {
			console.log('Creating production KV namespace...');
			const prodResult = execSync('wrangler kv:namespace create icon_catalog_production', { encoding: 'utf8' });
			const prodMatch = prodResult.match(/id = \"([^\"]+)\"/);
			productionId = prodMatch ? prodMatch[1] : null;
		}
		
		if (!previewId) {
			console.log('Creating preview KV namespace...');
			const prevResult = execSync('wrangler kv:namespace create icon_catalog_preview', { encoding: 'utf8' });
			const prevMatch = prevResult.match(/id = \"([^\"]+)\"/);
			previewId = prevMatch ? prevMatch[1] : null;
		}
		
		console.log(`✅ KV namespaces ready:`);
		console.log(`   Production ID: ${productionId}`);
		console.log(`   Preview ID: ${previewId}`);
		
	} catch (error) {
		console.error('❌ Failed to set up KV namespaces:', error.message);
		process.exit(1);
	}

	// 3. Upload icon catalog to KV
	runCommand(
		`wrangler kv:key put --binding=ICON_CATALOG "icon_catalog" "${ICON_CATALOG_PATH}" --path`,
		'Uploading icon catalog to production KV'
	);

	runCommand(
		`wrangler kv:key put --binding=ICON_CATALOG --preview "icon_catalog" "${ICON_CATALOG_PATH}" --path`,
		'Uploading icon catalog to preview KV'
	);

	// 4. Pre-build and upload search index
	console.log('\n🔍 Building search index...');
	
	// Create a temporary script to build the index
	const indexBuilderScript = `
const { InvertedIndexService } = require('./src/domain/search/services/inverted-index.service.ts');
const { DEFAULT_SEARCH_CONFIG } = require('./src/domain/search/config/index.ts');
const { ConsoleLogger, LogLevel } = require('./src/infrastructure/logging/logger.ts');
const iconCatalog = require('./src/data/icon-catalog.json');

const logger = new ConsoleLogger(LogLevel.INFO);
const indexService = new InvertedIndexService(DEFAULT_SEARCH_CONFIG, logger);
indexService.buildIndex(iconCatalog.icons);
const searchIndex = indexService.getIndex();

// Convert Map to serializable object
const indexObject = Object.fromEntries(searchIndex.entries());
console.log(JSON.stringify(indexObject));
`;

	const tempScriptPath = path.join(__dirname, 'temp-index-builder.js');
	fs.writeFileSync(tempScriptPath, indexBuilderScript);
	
	try {
		// This would need to be implemented differently in a real scenario
		// For now, we'll skip the index upload and let it build at runtime
		console.log('⚠️  Search index will be built at runtime (optimization for later)');
	} finally {
		// Clean up temp file
		if (fs.existsSync(tempScriptPath)) {
			fs.unlinkSync(tempScriptPath);
		}
	}

	// 5. Generate MCP documentation and deploy
	runCommand('npm run deploy', 'Generating MCP docs and deploying to Cloudflare Workers');
	
	console.log('\n🎉 Deployment completed successfully!');
	console.log('📝 Next steps:');
	console.log('   - Verify KV data is accessible via wrangler kv:key list --binding=ICON_CATALOG');
	console.log('   - Test the deployed worker endpoints');
	console.log('   - Monitor performance and memory usage');
}

if (require.main === module) {
	main();
}