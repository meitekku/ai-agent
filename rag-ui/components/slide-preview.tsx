"use client";

import type { PresentationPlan } from "@/lib/proposal-panel-store";

interface SlidePreviewProps {
  plan: PresentationPlan;
  slideIndex: number;
}

/** Convert inches to percentage of slide (10 x 5.625 inches) */
function inchToPct(inches: number, axis: "x" | "y"): string {
  const base = axis === "x" ? 10 : 5.625;
  return `${(inches / base) * 100}%`;
}

function inchToWidth(inches: number): string {
  return `${(inches / 10) * 100}%`;
}

function inchToHeight(inches: number): string {
  return `${(inches / 5.625) * 100}%`;
}

export function SlidePreview({ plan, slideIndex }: SlidePreviewProps) {
  const slide = plan.slides[slideIndex];
  if (!slide) return null;

  const theme = plan.theme;

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border shadow-sm"
      style={{
        aspectRatio: "16/9",
        backgroundColor: `#${slide.bgColor || theme.background}`,
      }}
    >
      {/* Header bar (non-title, non-closing layouts) */}
      {slide.layout !== "title" && slide.layout !== "closing" && (
        <>
          <div
            className="absolute left-0 top-0 w-full"
            style={{
              height: inchToHeight(0.75),
              backgroundColor: `#${theme.primary}`,
            }}
          />
          <div
            className="absolute left-0 top-0 flex items-center truncate px-[4%] font-bold text-white"
            style={{
              height: inchToHeight(0.75),
              fontSize: "clamp(10px, 1.8vw, 18px)",
            }}
          >
            {slide.title}
          </div>
          {slide.subtitle && (
            <div
              className="absolute left-0 truncate px-[4%] italic"
              style={{
                top: inchToHeight(0.75),
                height: inchToHeight(0.32),
                fontSize: "clamp(7px, 1vw, 10px)",
                color: `#${theme.lightText}`,
              }}
            >
              {slide.subtitle}
            </div>
          )}
        </>
      )}

      {/* Footer bar (non-title layouts) */}
      {slide.layout !== "title" && (
        <div
          className="absolute bottom-0 left-0 w-full flex items-center justify-end px-[3%]"
          style={{
            height: inchToHeight(0.275),
            backgroundColor: `#${theme.primary}`,
            fontSize: "clamp(6px, 0.8vw, 8px)",
            color: `#${theme.accent || "CADCFC"}`,
          }}
        >
          Confidential | {slideIndex + 1} / {plan.slides.length}
        </div>
      )}

      {/* Elements */}
      {slide.elements.map((el, i) => {
        const style: React.CSSProperties = {
          position: "absolute",
          left: inchToPct(el.x, "x"),
          top: inchToPct(el.y, "y"),
          width: inchToWidth(el.w),
          height: inchToHeight(el.h),
          overflow: "hidden",
        };

        switch (el.type) {
          case "text":
            return (
              <div
                key={i}
                style={{
                  ...style,
                  fontSize: `clamp(6px, ${(el.fontSize || 14) * 0.07}vw, ${el.fontSize || 14}px)`,
                  fontWeight: el.bold ? "bold" : "normal",
                  fontStyle: el.italic ? "italic" : "normal",
                  color: `#${el.color || theme.text}`,
                  textAlign: el.align || "left",
                  display: "flex",
                  alignItems:
                    el.valign === "middle"
                      ? "center"
                      : el.valign === "bottom"
                        ? "flex-end"
                        : "flex-start",
                  padding: "2% 3%",
                  backgroundColor: el.fill ? `#${el.fill}` : undefined,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.4,
                }}
              >
                <span>{el.content}</span>
              </div>
            );

          case "shape":
            return (
              <div
                key={i}
                style={{
                  ...style,
                  backgroundColor: el.fill ? `#${el.fill}` : "transparent",
                  border: el.borderColor
                    ? `1px solid #${el.borderColor}`
                    : undefined,
                  borderRadius: "2px",
                }}
              />
            );

          case "list": {
            const items = el.items || [];
            return (
              <div
                key={i}
                style={{
                  ...style,
                  fontSize: `clamp(6px, ${(el.fontSize || 12) * 0.07}vw, ${el.fontSize || 12}px)`,
                  color: `#${el.color || theme.text}`,
                  padding: "2% 3%",
                  lineHeight: 1.5,
                }}
              >
                <ul className="list-disc pl-4 space-y-[0.3em]">
                  {items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          }

          case "kpi":
            return (
              <div
                key={i}
                style={{
                  ...style,
                  backgroundColor: `#${el.fill || "FFFFFF"}`,
                  borderRadius: "4px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* Accent bar */}
                <div
                  className="absolute left-0 top-0 w-full"
                  style={{
                    height: "4px",
                    backgroundColor: `#${el.valueColor || theme.accent}`,
                    borderRadius: "4px 4px 0 0",
                  }}
                />
                <div
                  className="font-bold"
                  style={{
                    fontSize: `clamp(10px, 2.5vw, 28px)`,
                    color: `#${el.valueColor || theme.accent}`,
                  }}
                >
                  {el.value}
                </div>
                <div
                  style={{
                    fontSize: `clamp(6px, 0.9vw, 10px)`,
                    color: `#${theme.lightText}`,
                    marginTop: "2px",
                  }}
                >
                  {el.label}
                </div>
              </div>
            );

          case "table": {
            const rows = el.rows || [];
            if (rows.length === 0) return null;
            return (
              <div key={i} style={{ ...style, overflow: "auto" }}>
                <table
                  className="w-full border-collapse"
                  style={{
                    fontSize: `clamp(5px, 0.8vw, 9px)`,
                  }}
                >
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="border px-1 py-0.5"
                            style={{
                              borderColor: "#DEE2E6",
                              fontWeight: ri === 0 ? "bold" : "normal",
                              color:
                                ri === 0
                                  ? "#FFFFFF"
                                  : `#${theme.text}`,
                              backgroundColor:
                                ri === 0
                                  ? `#${el.headerBg || theme.primary}`
                                  : ri % 2 === 0
                                    ? "#F8F9FA"
                                    : undefined,
                            }}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
}
