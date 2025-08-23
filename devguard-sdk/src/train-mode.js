
const natural = require('natural')

const classifier = new natural.BayesClassifier();

classifier.addDocument("TypeError: cannot read property 'x' of undefined", 'error');
classifier.addDocument("ReferenceError: assignment to undeclared variable 'x'", 'error');
classifier.addDocument("SyntaxError: Invalid or unexpected token", 'error');

classifier.addDocument("IndentationError: unexpected indent", 'error');
classifier.addDocument("TypeError: unsupported operand type(s) for +: 'int' and 'str'", 'error');
classifier.addDocument("NameError: name 'my_variable' is not defined", 'error');
classifier.addDocument("Exception: division by zero", 'error');

classifier.addDocument("Exception in thread 'main' java.lang.NullPointerException", 'error');
classifier.addDocument("java.io.FileNotFoundException: /path/to/file.txt (No such file or directory)", 'error');

classifier.addDocument("panic: runtime error: invalid memory address or nil pointer dereference", 'error');
classifier.addDocument("segmentation fault", 'error');
classifier.addDocument("command not found", 'error');

classifier.addDocument("Warning: a promise was created in a handler but was not returned from it", 'not_error');
classifier.addDocument("DeprecationWarning: a is deprecated, use b instead", 'not_error');
classifier.addDocument("Connected to database successfully.", 'not_error');
classifier.addDocument("Server listening on port 3000", 'not_error');
classifier.addDocument("[info]: processing request", 'not_error');
classifier.addDocument("The result is 42", 'not_error');

console.log('Training the model...');
classifier.train();
console.log('Training complete.');


classifier.save('error_classifier.json', (err, classifier) => {
    if (err) {
        console.error("Error saving the model:", err);
    } else {
        console.log('✅ Classifier saved successfully as error_classifier.json!');
    }
});

console.log('\n--- Testing the trained model ---');
const testCases = [
    "Error: Could not find module 'left-pad'", // Should be 'error'
    "SyntaxError: Unexpected identifier",      // Should be 'error'
    "User logged in successfully",              // Should be 'not_error'
    "Warning: component is deprecated",         // Should be 'not_error'
    "panic: could not connect to db",           // Should be 'error'
];

testCases.forEach(testCase => {
    const classification = classifier.classify(testCase);
    console.log(`'${testCase}' -> Classified as: ${classification}`);
});