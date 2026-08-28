# Arklake --- Visual Identity V1

**Status:** Current design direction\
**Selected direction:** A3 --- Clear Aqua + Soft Gold\
**Scope:** Landing page + authenticated product UI

## Visual reference

Full palette:
https://coolors.co/17333a-32c7c1-d7b45b-e6f7f5-f4f8f7-ffffff-d8e4e1-67747a-142127

> The HEX values in this document are the source of truth. The Coolors
> link is only a visual reference.

------------------------------------------------------------------------

## 1. Design direction

Arklake should feel:

- Clean
- Calm
- Modern
- Trustworthy
- Account-first / Web2-friendly
- Premium but not corporate
- Payment-focused

Avoid:

- Generic Web3 visual language
- Purple/blue crypto gradients
- Neon effects
- Dark Web3 aesthetic
- Green + white fintech look similar to AllScale
- Excessive gradients
- Using brand colors everywhere

The interface should remain mostly neutral.

Brand colors are accents, not the entire interface.

------------------------------------------------------------------------

## 2. Core brand palette

### Arklake Ink --- `#17333A`

Use for:

- Logo
- Primary buttons
- Major headings
- Strong UI emphasis
- Important navigation states

### Arklake Aqua --- `#32C7C1`

Use for:

- Brand accent
- Active states
- Selected elements
- Links where appropriate
- Arklake graphic / flow language
- Small visual highlights

Do NOT use Aqua for every button or every card.

### Arklake Soft Gold --- `#D7B45B`

Use for:

- Secondary brand accent
- Illustrations
- Graphic flow
- Small visual highlights
- Signature Arklake moments

Gold is NOT the warning status color.

------------------------------------------------------------------------

## 3. Neutral palette

### Aqua Mist --- `#E6F7F5`

Use for:

- Badges
- Selected backgrounds
- Subtle highlighted surfaces

### Lake Canvas --- `#F4F8F7`

Use for:

- Main page background
- Large neutral sections

### Pure Surface --- `#FFFFFF`

Use for:

- Cards
- Wallet panels
- Invoice panels
- Inputs
- Product surfaces

### Lake Border --- `#D8E4E1`

Use for:

- Borders
- Dividers
- Input outlines

### Slate --- `#67747A`

Use for:

- Secondary text
- Descriptions
- Metadata

### Deep Text --- `#142127`

Use for:

- Main body text
- High-contrast text

------------------------------------------------------------------------

## 4. Approximate color distribution

The product should NOT look Aqua/Gold everywhere.

Target visual balance:

- \~70% neutral backgrounds/surfaces
- \~20% Ink / Deep Text
- \~7% Aqua
- \~3% Soft Gold

These percentages are guidance, not strict mathematical requirements.

------------------------------------------------------------------------

## 5. Buttons

### Primary CTA

- Background: `#17333A`
- Text: `#FFFFFF`

Primary CTA should normally use Ink, NOT Aqua.

### Secondary CTA

- Background: `#FFFFFF`
- Text: `#17333A`
- Border: `#D8E4E1`

### Brand accent

`#32C7C1`

Use selectively for interaction and identity.

------------------------------------------------------------------------

## 6. Semantic colors

Brand colors and product status colors must remain separate.

Do NOT assume:

- Aqua = Paid
- Gold = Warning
- Aqua = Success

Payment/invoice states need their own semantic system:

- Paid / Success → dedicated green
- Verifying / Processing → dedicated amber
- Failed / Error → dedicated red
- Unpaid / Neutral → neutral gray/ink

Exact semantic HEX values have NOT been finalized yet.

Do not invent permanent semantic colors without review.

------------------------------------------------------------------------

## 7. Arklake signature

The core visual signature is:

**Arklake Ink `#17333A` + Arklake Aqua `#32C7C1` + Arklake Soft Gold
`#D7B45B`**

The identity should come from how these colors interact with neutral
space, typography and Arklake's graphic language --- not from covering
the interface in brand colors.

------------------------------------------------------------------------

## 8. Implementation guardrails

When implementing this design:

- Do not redesign layouts unless explicitly requested.
- Do not add new product features.
- Do not add decorative gradients everywhere.
- Do not introduce additional brand colors.
- Do not make every CTA Aqua.
- Do not convert the product to a dark theme.
- Do not imitate Movement, Circle, AllScale, Arc, or another project
 directly.
- Do not change product copy without approval.
- Preserve the existing Arklake information architecture.
- If another color is required for a product state, accessibility
 issue, or technical reason, report it first.

------------------------------------------------------------------------

## 9. Current status

This palette is the selected **Arklake A3 design direction**.

It is the current visual source of truth, but minor HEX adjustments may
still be made during final visual review.

**Do not reinterpret or replace the palette without approval.**

------------------------------------------------------------------------

## Codex instruction

Before implementing Arklake UI, read this document first.

Treat this document as the current visual source of truth.

Do not modify this file, replace the palette, invent additional
permanent brand colors, redesign layouts, or change product copy unless
explicitly approved.

Investigate the current implementation first and report the proposed
minimal changes before editing code.
