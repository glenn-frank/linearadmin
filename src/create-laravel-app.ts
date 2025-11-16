#!/usr/bin/env tsx

import { config } from "dotenv";
import { LinearClient } from "@linear/sdk";
import LaravelForgeAppCreator from "./laravel-forge-app-creator";

// Load environment variables
config();

async function main() {
  try {
    // Initialize Linear client
    const linear = new LinearClient({
      apiKey: process.env.LINEAR_API_KEY,
    });

    // Create Laravel Forge app creator instance
    const appCreator = new LaravelForgeAppCreator(linear);

    // Start the app creation process
    await appCreator.createApp();

    console.log("\n🎉 Laravel Forge app creation completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Navigate to your new project directory");
    console.log(
      "2. Start the Laravel backend: cd backend && php artisan serve"
    );
    console.log("3. Start the React frontend: cd frontend && npm run dev");
    console.log("4. Check your Linear project for the created issues");
    console.log("5. Begin development following the generated documentation");
  } catch (error) {
    console.error("❌ Error creating Laravel Forge app:", error.message);
    process.exit(1);
  }
}

// Run the main function
main();
