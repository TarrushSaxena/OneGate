const classifier = require('../ml/classifier');
const { predictML } = require('./mlBridge');
const aliases = { 'Data Analytics':'Data & Analytics','Customer Service':'Customer Support','Cyber Security':'Cybersecurity' };
async function routeSupport(text, departments) {
  const normalize = label => aliases[label] || label;
  try {
    const prediction = await predictML(text);
    const department = normalize(prediction.raw_department || prediction.department);
    if (departments.has(department)) return {department,model:'DistilBERT',fallback:false};
  } catch (_) { /* Existing local classifier remains available when ML is down. */ }
  const prediction = classifier.classify(text);
  const department = normalize(prediction.department);
  if (departments.has(department)) return {department,model:'Naive Bayes',fallback:true};
  const candidate = prediction.allScores.find(p=>departments.has(normalize(p.department)));
  if (!candidate) throw new Error('No configured support department matches the model labels');
  return {department:normalize(candidate.department),model:'Naive Bayes',fallback:true};
}
module.exports={routeSupport};
