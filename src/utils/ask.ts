import { createInterface as createReadLineInterface } from "readline";

export default (query: string): Promise<string> => new Promise((resolve) => {
    const readline = createReadLineInterface({
        input: process.stdin,
        output: process.stdout
    });

    readline.question(query, answer => {
        resolve(answer);
        readline.close();
    });
});