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
  } else if (type === 'AUDIT_DYNASTIC_HEALTH') {
    // Synchronize worker engine people cache
    engine.people = new Map(payload.people.map(p => [p.id, p]));
    engine.nameToIds = new Map();
    payload.people.forEach(p => {
      if (p.name) {
        const lowerName = p.name.toLowerCase();
        if (!engine.nameToIds.has(lowerName)) {
          engine.nameToIds.set(lowerName, []);
        }
        engine.nameToIds.get(lowerName).push(p.id);
      }
    });

    const conflicts = auditDynasticHealth(payload.people, engine);
    self.postMessage({ type: 'DYNASTIC_HEALTH_DONE', conflicts });
  }
};

const getPersonName = (p) => {
  if (!p) return 'Unknown';
  return (p.firstName ? p.firstName + ' ' + (p.familyName || '') : p.name || 'Unknown').trim();
};

function auditDynasticHealth(people, engine) {
  const conflicts = [];
  const currentYear = new Date().getFullYear();

  people.forEach(p => {
    const pName = getPersonName(p);
    const birth = p.birthYear !== undefined && p.birthYear !== null && p.birthYear !== '' ? parseInt(p.birthYear) : null;
    const death = p.deathYear !== undefined && p.deathYear !== null && p.deathYear !== '' ? parseInt(p.deathYear) : null;

    if (birth !== null) {
      // 1. Impossible Lifespan
      if (death !== null) {
        if (birth > death) {
          conflicts.push({
            personId: p.id,
            personName: pName,
            type: 'impossible_lifespan',
            message: `Born in ${birth} but died in ${death} (impossible lifespan).`,
            messageAr: `ولد في عام ${birth} ولكنه توفي في عام ${death} (فترة حياة غير منطقية).`,
            severity: 'error'
          });
        } else if (death - birth > 115) {
          conflicts.push({
            personId: p.id,
            personName: pName,
            type: 'impossible_lifespan',
            message: `Lived for ${death - birth} years (exceeds 115 years limit).`,
            messageAr: `عاش لمدة ${death - birth} عاماً (يتجاوز الحد الأقصى 115 عاماً).`,
            severity: 'error'
          });
        }
      } else {
        // Living person
        if (currentYear - birth > 115) {
          conflicts.push({
            personId: p.id,
            personName: pName,
            type: 'impossible_lifespan',
            message: `Age is ${currentYear - birth} years (exceeds 115 years, missing death year).`,
            messageAr: `العمر ${currentYear - birth} عاماً (يتجاوز 115 عاماً، تاريخ الوفاة مفقود).`,
            severity: 'error'
          });
        }
      }

      // 2. Parents chronological audits
      const checkParentRelation = (parentId, parentType) => {
        const parent = engine.getPerson(parentId);
        if (!parent) return;
        const parentName = getPersonName(parent);
        const parentBirth = parent.birthYear !== undefined && parent.birthYear !== null && parent.birthYear !== '' ? parseInt(parent.birthYear) : null;
        const parentDeath = parent.deathYear !== undefined && parent.deathYear !== null && parent.deathYear !== '' ? parseInt(parent.deathYear) : null;

        if (parentBirth !== null) {
          // Child born before parent born
          if (birth < parentBirth) {
            conflicts.push({
              personId: p.id,
              personName: pName,
              type: 'chronological_inversion',
              message: `Born in ${birth} before ${parentType === 'father' ? 'father' : 'mother'} ${parentName} was born in ${parentBirth}.`,
              messageAr: `ولد في عام ${birth} قبل ولادة ال${parentType === 'father' ? 'أب' : 'أم'} ${parentName} في عام ${parentBirth}.`,
              severity: 'error'
            });
          } else {
            // Parent's age when child was born
            const ageAtBirth = birth - parentBirth;
            if (ageAtBirth < 14) {
              conflicts.push({
                personId: p.id,
                personName: pName,
                type: 'parent_age_gap',
                message: `${parentType === 'father' ? 'Father' : 'Mother'} ${parentName} was only ${ageAtBirth} years old when this child was born.`,
                messageAr: `كان ال${parentType === 'father' ? 'أب' : 'أم'} ${parentName} يبلغ من العمر ${ageAtBirth} عاماً فقط عند ولادة هذا الطفل.`,
                severity: 'warning'
              });
            } else if (ageAtBirth > 65) {
              conflicts.push({
                personId: p.id,
                personName: pName,
                type: 'parent_age_gap',
                message: `${parentType === 'father' ? 'Father' : 'Mother'} ${parentName} was ${ageAtBirth} years old when this child was born.`,
                messageAr: `كان ال${parentType === 'father' ? 'أب' : 'أم'} ${parentName} يبلغ من العمر ${ageAtBirth} عاماً عند ولادة هذا الطفل.`,
                severity: 'warning'
              });
            }
          }
        }

        // Child born after parent died
        if (parentDeath !== null) {
          const buffer = parentType === 'father' ? 1 : 0; // Father could die during pregnancy
          if (birth > parentDeath + buffer) {
            conflicts.push({
              personId: p.id,
              personName: pName,
              type: 'chronological_inversion',
              message: `Born in ${birth} after ${parentType === 'father' ? 'father' : 'mother'} ${parentName} died in ${parentDeath}.`,
              messageAr: `ولد في عام ${birth} بعد وفاة ال${parentType === 'father' ? 'أب' : 'أم'} ${parentName} في عام ${parentDeath}.`,
              severity: 'error'
            });
          }
        }
      };

      if (p.fatherId) checkParentRelation(p.fatherId, 'father');
      if (p.motherId) checkParentRelation(p.motherId, 'mother');
    }
  });

  return conflicts;
}
