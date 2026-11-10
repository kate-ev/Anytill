declare module "*.css";

declare namespace JSX {
  interface IntrinsicElements {
    "intents-checkout": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      api?: string;
      "payment-id"?: string;
      merchant?: string;
      amount?: string;
      "order-ref"?: string;
      "order-name"?: string;
      preview?: string;
    };
  }
}
