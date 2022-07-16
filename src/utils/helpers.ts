export const randomInteger = (min: number, max: number) => {
    return min + Math.floor(Math.random() * (max - min));
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));