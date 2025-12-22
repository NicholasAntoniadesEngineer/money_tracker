/**
 * Helper Script to Populate Example Data into Supabase
 * Run this in browser console after Supabase is initialized
 * 
 * Usage:
 * 1. Open browser console on any page
 * 2. Make sure DatabaseService is initialized
 * 3. Copy and paste this entire script
 * 4. Run: await populateExampleData()
 */

async function populateExampleData() {
    try {
        // Initialize database service if needed
        if (!window.DatabaseService || !window.DatabaseService.client) {
            await window.DatabaseService.initialize();
        }

        if (!window.ExampleData) {
            throw new Error('ExampleData library not loaded');
        }

        const exampleMonths = window.ExampleData.getAllExampleMonths();
        let savedCount = 0;
        let skippedCount = 0;

        console.log(`Starting to populate ${exampleMonths.length} example months...`);

        for (const monthData of exampleMonths) {
            if (!monthData || !monthData.key) {
                console.warn('Skipping invalid month data:', monthData);
                continue;
            }

            try {
                // Check if month already exists
                const existing = await window.DatabaseService.getMonth(monthData.key);
                
                if (existing) {
                    console.log(`Month ${monthData.key} already exists, skipping...`);
                    skippedCount++;
                    continue;
                }

                // Save to Supabase
                await window.DatabaseService.saveMonth(monthData.key, monthData);
                console.log(`✓ Saved ${monthData.key}: ${monthData.monthName} ${monthData.year}`);
                savedCount++;
            } catch (error) {
                console.error(`Error saving ${monthData.key}:`, error);
            }
        }

        console.log(`\n✅ Complete!`);
        console.log(`   Saved: ${savedCount} months`);
        console.log(`   Skipped (already exist): ${skippedCount} months`);
        console.log(`   Total: ${exampleMonths.length} months`);

        return {
            success: true,
            saved: savedCount,
            skipped: skippedCount,
            total: exampleMonths.length
        };
    } catch (error) {
        console.error('Error populating example data:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Make available globally
window.populateExampleData = populateExampleData;

console.log('Example data population helper loaded!');
console.log('Run: await populateExampleData()');

