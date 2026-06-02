import { FamilyTreeEngine } from './engine.js';

const engine = new FamilyTreeEngine();

self.onmessage = (e) => {
  const { type, payload } = e.data;
  
  if (type === 'GENERATE_MOCK_GIANT') {
    engine.generateGiantMockTree(payload.size || 100000);
    const people = engine.getAllPeople();
    self.postMessage({ type: 'MOCK_GIANT_DONE', result: people });
  } else if (type === 'PARSE_TEXT') {
    const res = engine.parseLineageText(payload.text);
    const people = engine.getAllPeople();
    self.postMessage({ 
      type: 'PARSE_TEXT_DONE', 
      result: people, 
      count: res.count, 
      firstId: res.firstId 
    });
  }
};
