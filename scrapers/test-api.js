const AmazonApiClient = require('./amazon-api-client');

async function testAPI() {
  const client = new AmazonApiClient();
  
  try {
    console.log('Testing single ASIN...');
    const result = await client.getItems(['B0D4BZ897F']);
    console.log('✅ Success:', result);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testAPI();