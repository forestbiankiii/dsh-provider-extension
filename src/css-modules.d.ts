declare module '*.module.css' {
  const classes: Record<string, string>
  export const cssText: string
  export default classes
}
