export type Sizes = "sm" | "md" | "lg";

export type BadgeColors = "gray" | "brand" | "error" | "warning" | "success" | "gray-blue" | "blue-light" | "blue" | "indigo" | "purple" | "pink" | "orange";

type ExtractColorKeys<T> = T extends { styles: infer C } ? keyof C : never;
type ExtractBadgeKeys<T> = keyof T;
export type BadgeTypeToColorMap<T> = {
    [K in ExtractBadgeKeys<T>]: ExtractColorKeys<T[K]>;
};

export const badgeTypes = {
    pillColor: "pill-color",
    badgeColor: "color",
    badgeModern: "modern",
} as const;

export type BadgeTypes = (typeof badgeTypes)[keyof typeof badgeTypes];
