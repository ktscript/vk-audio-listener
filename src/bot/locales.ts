export const FILE_IS_EMPTY = "😶 Файл пуст.";

export const format = (text: string, ...args: any[]) => {
    let index = 0;
    
    return text.replace(/{}/g, () => args[index++]);
}