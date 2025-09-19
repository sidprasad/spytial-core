/**
 * Example: Using CnD Core with Data Navigator for Visual Accessibility
 * 
 * This example shows how to generate layouts and convert them to 
 * Data Navigator accessibility structures for screen readers.
 */

import { 
  JSONDataInstance, 
  SGraphQueryEvaluator, 
  LayoutInstance, 
  parseLayoutSpec,
  translateToDataNavigator,
  DataNavigatorTranslator
} from 'cnd-core';

// Sample data representing people and companies
const sampleData = {
  atoms: [
    { id: 'Alice', type: 'Person', label: 'Alice' },
    { id: 'Bob', type: 'Person', label: 'Bob' },
    { id: 'TechCorp', type: 'Company', label: 'TechCorp' }
  ],
  relations: [
    {
      id: 'works_for',
      name: 'works_for',
      types: ['Person', 'Company'],
      tuples: [
        { atoms: ['Alice', 'TechCorp'], types: ['Person', 'Company'] },
        { atoms: ['Bob', 'TechCorp'], types: ['Person', 'Company'] }
      ]
    }
  ]
};

// Layout specification with constraints and groups
const layoutSpecYaml = `
nodes:
  - { id: Person, type: atom, color: "#FF6B35" }
  - { id: Company, type: atom, color: "#4ECDC4" }
constraints:
  - orient:
      selector: Person->Company
      directions: [below]
groups:
  - groupByField:
      name: "employees"
      relationName: "works_for"
      groupOn: 1
      addToGroup: 0
`;

async function demonstrateAccessibility() {
  console.log('=== CnD Core Data Navigator Demo ===\n');
  
  // 1. Set up data instance and evaluator
  console.log('1. Setting up data and evaluator...');
  const dataInstance = new JSONDataInstance(sampleData);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: dataInstance });
  
  // 2. Parse layout specification and create layout instance
  console.log('2. Creating layout instance...');
  const layoutSpec = parseLayoutSpec(layoutSpecYaml);
  const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
  
  // 3. Generate the layout
  console.log('3. Generating layout...');
  const { layout, error } = layoutInstance.generateLayout(dataInstance, {});
  
  if (error) {
    console.error('Layout generation failed:', error);
    return;
  }
  
  console.log(`✅ Layout generated successfully!`);
  console.log(`   - Nodes: ${layout.nodes.length}`);
  console.log(`   - Edges: ${layout.edges.length}`);
  console.log(`   - Groups: ${layout.groups.length}`);
  console.log(`   - Constraints: ${layout.constraints.length}\n`);
  
  // 4. Simple approach: Create translator and translate layout directly
  console.log('4. Translating layout to Data Navigator structure...');
  
  // Method 1: Use utility function
  const accessibilityData1 = translateToDataNavigator(layout, {
    includeSpatialProperties: true,
    generateNavigationRules: true,
    createDimensions: true
  });
  
  console.log('✅ Data Navigator structure generated via utility function');
  console.log(`   - Accessible nodes: ${Object.keys(accessibilityData1.nodes).length}`);
  console.log(`   - Navigation rules: ${Object.keys(accessibilityData1.navigationRules || {}).length}`);
  console.log(`   - Element data: ${Object.keys(accessibilityData1.elementData || {}).length}`);
  
  // Method 2: Create translator directly and translate
  console.log('\n5. Using DataNavigatorTranslator class directly...');
  const translator = new DataNavigatorTranslator({
    includeSpatialProperties: true,
    generateNavigationRules: true,
    createDimensions: true
  });
  
  const accessibilityData2 = translator.translate(layout);
  console.log('✅ Data Navigator structure generated via translator class\n');
  
  // 6. Demonstrate custom accessibility configuration
  console.log('6. Demonstrating custom configuration...');
  const customTranslator = new DataNavigatorTranslator({
    includeSpatialProperties: false,
    generateNavigationRules: true,
    createDimensions: true,
    nodeSemanticGenerator: (node) => ({
      label: `🎯 ${node.label} - A ${node.mostSpecificType} in the organization`,
      elementType: 'button',
      role: 'treeitem',
      attributes: {
        'aria-level': '1',
        'aria-expanded': 'false'
      }
    })
  });
  
  const customAccessibilityData = customTranslator.translate(layout);
  console.log('✅ Custom Data Navigator structure generated');
  
  // 7. Show sample accessibility metadata
  console.log('\n7. Sample accessibility metadata:');
  const firstNodeId = Object.keys(accessibilityData1.nodes)[0];
  const firstNodeData = accessibilityData1.elementData?.[firstNodeId];
  
  if (firstNodeData) {
    console.log(`\n📋 Node "${firstNodeId}" accessibility metadata:`);
    console.log(`   Label: "${firstNodeData.semantics?.label}"`);
    console.log(`   Role: "${firstNodeData.semantics?.role}"`);
    console.log(`   Element Type: "${firstNodeData.semantics?.elementType}"`);
    
    if (firstNodeData.spatialProperties) {
      console.log(`   Spatial: ${firstNodeData.spatialProperties.width}x${firstNodeData.spatialProperties.height}`);
    }
    
    if (firstNodeData.semantics?.attributes) {
      console.log(`   ARIA Attributes:`, firstNodeData.semantics.attributes);
    }
  }
  
  // 8. Show navigation rules
  console.log('\n🧭 Navigation Rules:');
  const navRules = accessibilityData1.navigationRules || {};
  Object.entries(navRules).slice(0, 3).forEach(([ruleId, rule]) => {
    console.log(`   ${ruleId}: ${rule.direction} navigation via "${rule.key}"`);
  });
  
  console.log('\n🎉 Data Navigator demo completed successfully!');
  console.log('\nKey Benefits:');
  console.log('• Simple API: Just pass your layout to the translator');
  console.log('• Flexible: Customize semantic labels and navigation rules');
  console.log('• Separates concerns: Layout generation and accessibility are distinct');
  console.log('\nThis Data Navigator structure can now be used with:');
  console.log('• Screen readers for audio descriptions');
  console.log('• Keyboard navigation systems');
  console.log('• Voice control interfaces');
  console.log('• Custom assistive technologies');
}

// Run the demo
demonstrateAccessibility().catch(console.error);