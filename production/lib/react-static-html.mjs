import React from "react";

export const h = React.createElement;

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attributeName(name) {
  if (name === "className") return "class";
  if (name === "htmlFor") return "for";
  if (name === "defaultValue") return "value";
  if (name === "defaultChecked") return "checked";
  if (name === "autoComplete") return "autocomplete";
  if (name === "inputMode") return "inputmode";
  return name;
}

function renderAttributes(type, props = {}) {
  const attributes = Object.entries(props)
    .filter(([name, value]) => name !== "children" && name !== "dangerouslySetInnerHTML" && name !== "key" && value !== false && value !== null && value !== undefined)
    .filter(([name]) => !(type === "textarea" && name === "defaultValue"))
    .filter(([name]) => !(type === "select" && name === "defaultValue"))
    .filter(([name]) => !name.startsWith("on"))
    .map(([name, value]) => {
      const htmlName = attributeName(name);
      if (value === true) return htmlName;
      return `${htmlName}="${escapeHtml(value)}"`;
    });
  return attributes.length ? ` ${attributes.join(" ")}` : "";
}

function renderChildren(children) {
  return React.Children.toArray(children).map((child) => renderStaticElement(child)).join("");
}

export function renderStaticElement(element) {
  if (element === null || element === undefined || element === false || element === true) return "";
  if (typeof element === "string" || typeof element === "number") return escapeHtml(element);
  if (Array.isArray(element)) return element.map((child) => renderStaticElement(child)).join("");
  if (!React.isValidElement(element)) return "";
  if (element.type === React.Fragment) return renderChildren(element.props.children);
  if (typeof element.type === "function") return renderStaticElement(element.type(element.props));
  if (typeof element.type !== "string") return "";

  const attributes = renderAttributes(element.type, element.props);
  if (VOID_TAGS.has(element.type)) return `<${element.type}${attributes}>`;
  if (element.type === "textarea" && element.props.defaultValue !== undefined && element.props.children === undefined) {
    return `<textarea${attributes}>${escapeHtml(element.props.defaultValue)}</textarea>`;
  }
  return `<${element.type}${attributes}>${renderChildren(element.props.children)}</${element.type}>`;
}
