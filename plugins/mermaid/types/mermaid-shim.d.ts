declare module 'mermaid' {
  export interface MermaidConfig {
    startOnLoad?: boolean;
    securityLevel?: string;
    theme?: string;
    themeVariables?: Record<string, string>;
  }

  export interface MermaidRunOptions {
    nodes?: HTMLElement[];
    suppressErrors?: boolean;
  }

  const mermaid: {
    initialize(config: MermaidConfig): void;
    run(options?: MermaidRunOptions): Promise<void>;
  };

  export default mermaid;
}
