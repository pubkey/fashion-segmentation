
export type Dimensions = {
    width: number;
    height: number;
}


export interface ColorRatio {
    /**
     * string as hex with training hash (#)
     */
    hex: string;
    /**
     * percentage of this colors, rounded
     */
    percentage: number;
}
