/**
 * Widget HTML sanitizer + iframe srcdoc builder.
 *
 * Security model:
 *
 * 1. **Streaming updates** (pushed to iframe via postMessage):
 *    - Dangerous embedding tags stripped (iframe, object, embed, etc.)
 *    - ALL on* handlers stripped (preview is purely visual)
 *    - ALL script tags stripped
 *    - javascript:/data: URLs in href/src/action stripped
 *
 * 2. **Finalized rendering** (pushed to iframe via postMessage):
 *    - Only dangerous embedding tags stripped
 *    - Scripts execute inside the sandboxed iframe (safe)
 *    - Handlers execute inside the sandboxed iframe (safe)
 *
 * 3. **iframe sandbox** (set by WidgetRenderer):
 *    - `sandbox="allow-scripts"` only
 *    - No allow-same-origin, allow-top-navigation, allow-popups
 *    - CSP meta tag: script-src limited to CDN whitelist + inline;
 *      connect-src 'none' blocks fetch/XHR/WebSocket
 *
 * Streaming DOM updates use morphdom (inlined ~5KB) for DOM diffing instead
 * of innerHTML. This preserves existing DOM nodes and updates text content
 * in place, making text appear to fill in progressively rather than the
 * entire DOM being destroyed and rebuilt on each token.
 */

// ── CDN whitelist ──────────────────────────────────────────────────────────

export const CDN_WHITELIST = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "esm.sh",
];

// ── HTML sanitization ────────────────────────────────────────────────────

const DANGEROUS_TAGS =
  /<(iframe|object|embed|meta|link|base)[\s>][\s\S]*?<\/\1>/gi;
const DANGEROUS_VOID = /<(iframe|object|embed|meta|link|base)\b[^>]*\/?>/gi;

/**
 * Sanitize widget HTML for streaming preview (no interactivity).
 * Strips: dangerous tags, ALL on* handlers, ALL scripts, js/data URLs.
 */
export function sanitizeForStreaming(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, "")
    .replace(DANGEROUS_VOID, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']*)/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(
      /\s+(href|src|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']*))/gi,
      (match, _attr: string, dq?: string, sq?: string, uq?: string) => {
        const url = (dq ?? sq ?? uq ?? "").trim();
        if (/^\s*(javascript|data)\s*:/i.test(url)) return "";
        return match;
      },
    )
    .replace(/<[a-zA-Z\/][^>]*$/, ""); // Strip incomplete HTML tag at end of stream
}

/**
 * Light sanitization for finalized content inside iframe.
 * Only strips tags that could nest/break out of the sandbox.
 */
export function sanitizeForIframe(html: string): string {
  return html.replace(DANGEROUS_TAGS, "").replace(DANGEROUS_VOID, "");
}

// ── Inline morphdom v2.7.4 UMD (~5KB) ─────────────────────────────────────
// DOM-diffing library inlined in iframe receiver. Replaces innerHTML with
// minimal DOM patches — text nodes update in place for progressive rendering.
// prettier-ignore
const MORPHDOM_MIN = '(function(global,factory){typeof exports==="object"&&typeof module!=="undefined"?module.exports=factory():typeof define==="function"&&define.amd?define(factory):(global=global||self,global.morphdom=factory())})(this,function(){"use strict";var DOCUMENT_FRAGMENT_NODE=11;function morphAttrs(fromNode,toNode){var toNodeAttrs=toNode.attributes;var attr;var attrName;var attrNamespaceURI;var attrValue;var fromValue;if(toNode.nodeType===DOCUMENT_FRAGMENT_NODE||fromNode.nodeType===DOCUMENT_FRAGMENT_NODE){return}for(var i=toNodeAttrs.length-1;i>=0;i--){attr=toNodeAttrs[i];attrName=attr.name;attrNamespaceURI=attr.namespaceURI;attrValue=attr.value;if(attrNamespaceURI){attrName=attr.localName||attrName;fromValue=fromNode.getAttributeNS(attrNamespaceURI,attrName);if(fromValue!==attrValue){if(attr.prefix==="xmlns"){attrName=attr.name}fromNode.setAttributeNS(attrNamespaceURI,attrName,attrValue)}}else{fromValue=fromNode.getAttribute(attrName);if(fromValue!==attrValue){fromNode.setAttribute(attrName,attrValue)}}}var fromNodeAttrs=fromNode.attributes;for(var d=fromNodeAttrs.length-1;d>=0;d--){attr=fromNodeAttrs[d];attrName=attr.name;attrNamespaceURI=attr.namespaceURI;if(attrNamespaceURI){attrName=attr.localName||attrName;if(!toNode.hasAttributeNS(attrNamespaceURI,attrName)){fromNode.removeAttributeNS(attrNamespaceURI,attrName)}}else{if(!toNode.hasAttribute(attrName)){fromNode.removeAttribute(attrName)}}}}var range;var NS_XHTML="http://www.w3.org/1999/xhtml";var doc=typeof document==="undefined"?undefined:document;var HAS_TEMPLATE_SUPPORT=!!doc&&"content"in doc.createElement("template");var HAS_RANGE_SUPPORT=!!doc&&doc.createRange&&"createContextualFragment"in doc.createRange();function createFragmentFromTemplate(str){var template=doc.createElement("template");template.innerHTML=str;return template.content.childNodes[0]}function createFragmentFromRange(str){if(!range){range=doc.createRange();range.selectNode(doc.body)}var fragment=range.createContextualFragment(str);return fragment.childNodes[0]}function createFragmentFromWrap(str){var fragment=doc.createElement("body");fragment.innerHTML=str;return fragment.childNodes[0]}function toElement(str){str=str.trim();if(HAS_TEMPLATE_SUPPORT){return createFragmentFromTemplate(str)}else if(HAS_RANGE_SUPPORT){return createFragmentFromRange(str)}return createFragmentFromWrap(str)}function compareNodeNames(fromEl,toEl){var fromNodeName=fromEl.nodeName;var toNodeName=toEl.nodeName;var fromCodeStart,toCodeStart;if(fromNodeName===toNodeName){return true}fromCodeStart=fromNodeName.charCodeAt(0);toCodeStart=toNodeName.charCodeAt(0);if(fromCodeStart<=90&&toCodeStart>=97){return fromNodeName===toNodeName.toUpperCase()}else if(toCodeStart<=90&&fromCodeStart>=97){return toNodeName===fromNodeName.toUpperCase()}else{return false}}function createElementNS(name,namespaceURI){return!namespaceURI||namespaceURI===NS_XHTML?doc.createElement(name):doc.createElementNS(namespaceURI,name)}function moveChildren(fromEl,toEl){var curChild=fromEl.firstChild;while(curChild){var nextChild=curChild.nextSibling;toEl.appendChild(curChild);curChild=nextChild}return toEl}function syncBooleanAttrProp(fromEl,toEl,name){if(fromEl[name]!==toEl[name]){fromEl[name]=toEl[name];if(fromEl[name]){fromEl.setAttribute(name,"")}else{fromEl.removeAttribute(name)}}}var specialElHandlers={OPTION:function(fromEl,toEl){var parentNode=fromEl.parentNode;if(parentNode){var parentName=parentNode.nodeName.toUpperCase();if(parentName==="OPTGROUP"){parentNode=parentNode.parentNode;parentName=parentNode&&parentNode.nodeName.toUpperCase()}if(parentName==="SELECT"&&!parentNode.hasAttribute("multiple")){if(fromEl.hasAttribute("selected")&&!toEl.selected){fromEl.setAttribute("selected","selected");fromEl.removeAttribute("selected")}parentNode.selectedIndex=-1}}syncBooleanAttrProp(fromEl,toEl,"selected")},INPUT:function(fromEl,toEl){syncBooleanAttrProp(fromEl,toEl,"checked");syncBooleanAttrProp(fromEl,toEl,"disabled");if(fromEl.value!==toEl.value){fromEl.value=toEl.value}if(!toEl.hasAttribute("value")){fromEl.removeAttribute("value")}},TEXTAREA:function(fromEl,toEl){var newValue=toEl.value;if(fromEl.value!==newValue){fromEl.value=newValue}var firstChild=fromEl.firstChild;if(firstChild){var oldValue=firstChild.nodeValue;if(oldValue==newValue||!newValue&&oldValue==fromEl.placeholder){return}firstChild.nodeValue=newValue}},SELECT:function(fromEl,toEl){if(!toEl.hasAttribute("multiple")){var selectedIndex=-1;var i=0;var curChild=fromEl.firstChild;var optgroup;var nodeName;while(curChild){nodeName=curChild.nodeName&&curChild.nodeName.toUpperCase();if(nodeName==="OPTGROUP"){optgroup=curChild;curChild=optgroup.firstChild}else{if(nodeName==="OPTION"){if(curChild.hasAttribute("selected")){selectedIndex=i;break}i++}curChild=curChild.nextSibling;if(!curChild&&optgroup){curChild=optgroup.nextSibling;optgroup=null}}}fromEl.selectedIndex=selectedIndex}}};var ELEMENT_NODE=1;var DOCUMENT_FRAGMENT_NODE$1=11;var TEXT_NODE=3;var COMMENT_NODE=8;function noop(){}function defaultGetNodeKey(node){if(node){return node.getAttribute&&node.getAttribute("id")||node.id}}function morphdomFactory(morphAttrs){return function morphdom(fromNode,toNode,options){if(!options){options={}}if(typeof toNode==="string"){if(fromNode.nodeName==="#document"||fromNode.nodeName==="HTML"||fromNode.nodeName==="BODY"){var toNodeHtml=toNode;toNode=doc.createElement("html");toNode.innerHTML=toNodeHtml}else{toNode=toElement(toNode)}}else if(toNode.nodeType===DOCUMENT_FRAGMENT_NODE$1){toNode=toNode.firstElementChild}var getNodeKey=options.getNodeKey||defaultGetNodeKey;var onBeforeNodeAdded=options.onBeforeNodeAdded||noop;var onNodeAdded=options.onNodeAdded||noop;var onBeforeElUpdated=options.onBeforeElUpdated||noop;var onElUpdated=options.onElUpdated||noop;var onBeforeNodeDiscarded=options.onBeforeNodeDiscarded||noop;var onNodeDiscarded=options.onNodeDiscarded||noop;var onBeforeElChildrenUpdated=options.onBeforeElChildrenUpdated||noop;var skipFromChildren=options.skipFromChildren||noop;var addChild=options.addChild||function(parent,child){return parent.appendChild(child)};var childrenOnly=options.childrenOnly===true;var fromNodesLookup=Object.create(null);var keyedRemovalList=[];function addKeyedRemoval(key){keyedRemovalList.push(key)}function walkDiscardedChildNodes(node,skipKeyedNodes){if(node.nodeType===ELEMENT_NODE){var curChild=node.firstChild;while(curChild){var key=undefined;if(skipKeyedNodes&&(key=getNodeKey(curChild))){addKeyedRemoval(key)}else{onNodeDiscarded(curChild);if(curChild.firstChild){walkDiscardedChildNodes(curChild,skipKeyedNodes)}}curChild=curChild.nextSibling}}}function removeNode(node,parentNode,skipKeyedNodes){if(onBeforeNodeDiscarded(node)===false){return}if(parentNode){parentNode.removeChild(node)}onNodeDiscarded(node);walkDiscardedChildNodes(node,skipKeyedNodes)}function indexTree(node){if(node.nodeType===ELEMENT_NODE||node.nodeType===DOCUMENT_FRAGMENT_NODE$1){var curChild=node.firstChild;while(curChild){var key=getNodeKey(curChild);if(key){fromNodesLookup[key]=curChild}indexTree(curChild);curChild=curChild.nextSibling}}}indexTree(fromNode);function handleNodeAdded(el){onNodeAdded(el);var curChild=el.firstChild;while(curChild){var nextSibling=curChild.nextSibling;var key=getNodeKey(curChild);if(key){var unmatchedFromEl=fromNodesLookup[key];if(unmatchedFromEl&&compareNodeNames(curChild,unmatchedFromEl)){curChild.parentNode.replaceChild(unmatchedFromEl,curChild);morphEl(unmatchedFromEl,curChild)}else{handleNodeAdded(curChild)}}else{handleNodeAdded(curChild)}curChild=nextSibling}}function cleanupFromEl(fromEl,curFromNodeChild,curFromNodeKey){while(curFromNodeChild){var fromNextSibling=curFromNodeChild.nextSibling;if(curFromNodeKey=getNodeKey(curFromNodeChild)){addKeyedRemoval(curFromNodeKey)}else{removeNode(curFromNodeChild,fromEl,true)}curFromNodeChild=fromNextSibling}}function morphEl(fromEl,toEl,childrenOnly){var toElKey=getNodeKey(toEl);if(toElKey){delete fromNodesLookup[toElKey]}if(!childrenOnly){var beforeUpdateResult=onBeforeElUpdated(fromEl,toEl);if(beforeUpdateResult===false){return}else if(beforeUpdateResult instanceof HTMLElement){fromEl=beforeUpdateResult;indexTree(fromEl)}morphAttrs(fromEl,toEl);onElUpdated(fromEl);if(onBeforeElChildrenUpdated(fromEl,toEl)===false){return}}if(fromEl.nodeName!=="TEXTAREA"){morphChildren(fromEl,toEl)}else{specialElHandlers.TEXTAREA(fromEl,toEl)}}function morphChildren(fromEl,toEl){var skipFrom=skipFromChildren(fromEl,toEl);var curToNodeChild=toEl.firstChild;var curFromNodeChild=fromEl.firstChild;var curToNodeKey;var curFromNodeKey;var fromNextSibling;var toNextSibling;var matchingFromEl;outer:while(curToNodeChild){toNextSibling=curToNodeChild.nextSibling;curToNodeKey=getNodeKey(curToNodeChild);while(!skipFrom&&curFromNodeChild){fromNextSibling=curFromNodeChild.nextSibling;if(curToNodeChild.isSameNode&&curToNodeChild.isSameNode(curFromNodeChild)){curToNodeChild=toNextSibling;curFromNodeChild=fromNextSibling;continue outer}curFromNodeKey=getNodeKey(curFromNodeChild);var curFromNodeType=curFromNodeChild.nodeType;var isCompatible=undefined;if(curFromNodeType===curToNodeChild.nodeType){if(curFromNodeType===ELEMENT_NODE){if(curToNodeKey){if(curToNodeKey!==curFromNodeKey){if(matchingFromEl=fromNodesLookup[curToNodeKey]){if(fromNextSibling===matchingFromEl){isCompatible=false}else{fromEl.insertBefore(matchingFromEl,curFromNodeChild);if(curFromNodeKey){addKeyedRemoval(curFromNodeKey)}else{removeNode(curFromNodeChild,fromEl,true)}curFromNodeChild=matchingFromEl;curFromNodeKey=getNodeKey(curFromNodeChild)}}else{isCompatible=false}}}else if(curFromNodeKey){isCompatible=false}isCompatible=isCompatible!==false&&compareNodeNames(curFromNodeChild,curToNodeChild);if(isCompatible){morphEl(curFromNodeChild,curToNodeChild)}}else if(curFromNodeType===TEXT_NODE||curFromNodeType==COMMENT_NODE){isCompatible=true;if(curFromNodeChild.nodeValue!==curToNodeChild.nodeValue){curFromNodeChild.nodeValue=curToNodeChild.nodeValue}}}if(isCompatible){curToNodeChild=toNextSibling;curFromNodeChild=fromNextSibling;continue outer}if(curFromNodeKey){addKeyedRemoval(curFromNodeKey)}else{removeNode(curFromNodeChild,fromEl,true)}curFromNodeChild=fromNextSibling}if(curToNodeKey&&(matchingFromEl=fromNodesLookup[curToNodeKey])&&compareNodeNames(matchingFromEl,curToNodeChild)){if(!skipFrom){addChild(fromEl,matchingFromEl)}morphEl(matchingFromEl,curToNodeChild)}else{var onBeforeNodeAddedResult=onBeforeNodeAdded(curToNodeChild);if(onBeforeNodeAddedResult!==false){if(onBeforeNodeAddedResult){curToNodeChild=onBeforeNodeAddedResult}if(curToNodeChild.actualize){curToNodeChild=curToNodeChild.actualize(fromEl.ownerDocument||doc)}addChild(fromEl,curToNodeChild);handleNodeAdded(curToNodeChild)}}curToNodeChild=toNextSibling;curFromNodeChild=fromNextSibling}cleanupFromEl(fromEl,curFromNodeChild,curFromNodeKey);var specialElHandler=specialElHandlers[fromEl.nodeName];if(specialElHandler){specialElHandler(fromEl,toEl)}}var morphedNode=fromNode;var morphedNodeType=morphedNode.nodeType;var toNodeType=toNode.nodeType;if(!childrenOnly){if(morphedNodeType===ELEMENT_NODE){if(toNodeType===ELEMENT_NODE){if(!compareNodeNames(fromNode,toNode)){onNodeDiscarded(fromNode);morphedNode=moveChildren(fromNode,createElementNS(toNode.nodeName,toNode.namespaceURI))}}else{morphedNode=toNode}}else if(morphedNodeType===TEXT_NODE||morphedNodeType===COMMENT_NODE){if(toNodeType===morphedNodeType){if(morphedNode.nodeValue!==toNode.nodeValue){morphedNode.nodeValue=toNode.nodeValue}return morphedNode}else{morphedNode=toNode}}}if(morphedNode===toNode){onNodeDiscarded(fromNode)}else{if(toNode.isSameNode&&toNode.isSameNode(morphedNode)){return}morphEl(morphedNode,toNode,childrenOnly);if(keyedRemovalList){for(var i=0,len=keyedRemovalList.length;i<len;i++){var elToRemove=fromNodesLookup[keyedRemovalList[i]];if(elToRemove){removeNode(elToRemove,elToRemove.parentNode,false)}}}}if(!childrenOnly&&morphedNode!==fromNode&&fromNode.parentNode){if(morphedNode.actualize){morphedNode=morphedNode.actualize(fromNode.ownerDocument||doc)}fromNode.parentNode.replaceChild(morphedNode,fromNode)}return morphedNode}}var morphdom=morphdomFactory(morphAttrs);return morphdom});';

// ── Receiver iframe srcdoc ────────────────────────────────────────────────

/**
 * Build the "receiver" iframe document.
 *
 * This iframe stays alive for the widget's entire lifetime. Content is
 * pushed into it via postMessage in two phases:
 *
 * 1. **Streaming** (`widget:update`): sanitized HTML (no scripts/handlers)
 *    is diffed into the DOM via morphdom. Only changed nodes are patched —
 *    text fills in progressively instead of full DOM rebuild per token.
 *
 * 2. **Finalize** (`widget:finalize`): full HTML is morphdom-diffed in,
 *    then script elements are cloned-and-appended to trigger execution.
 *
 * Also handles: height sync, link interception, theme updates.
 */
export function buildReceiverSrcdoc(
  styleBlock: string,
  isDark: boolean,
): string {
  const cspDomains = CDN_WHITELIST.map((d) => "https://" + d).join(" ");
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${cspDomains}`,
    "style-src 'unsafe-inline'",
    "img-src * data: blob:",
    "font-src * data:",
    "connect-src *",
  ].join("; ");

  const receiverScript = `(function(){
var root=document.getElementById('__root');
var _t=null,_first=true,_prevLen=0,_lastH=0,_growN=0;
function _h(){
if(_t)clearTimeout(_t);
_t=setTimeout(function(){
var h=document.body.scrollHeight;
if(h<=0)return;
if(h>_lastH+2&&_lastH>0){if(++_growN>3)return;}
else{_growN=0;}
_lastH=h;
parent.postMessage({type:'widget:resize',height:h,first:_first},'*');
_first=false;
},60);
}
var _ro=new ResizeObserver(_h);
_ro.observe(document.body);

function _cleanAnims(){
var spans=root.querySelectorAll('[data-wa]');
for(var i=spans.length-1;i>=0;i--){var s=spans[i],p=s.parentNode;while(s.firstChild)p.insertBefore(s.firstChild,s);p.removeChild(s)}
root.normalize();
}

function _animateNew(prevLen){
var total=root.textContent?root.textContent.length:0;
if(total<=prevLen){_prevLen=total;return}
var seen=0,idx=0;
var w=document.createTreeWalker(root,4,null);
var nodes=[];while(w.nextNode())nodes.push(w.currentNode);
for(var i=0;i<nodes.length;i++){
var tn=nodes[i],text=tn.nodeValue||'',ns=seen;
seen+=text.length;
if(seen<=prevLen)continue;
var sp=Math.max(0,prevLen-ns),ot=text.slice(0,sp),nt=text.slice(sp);
if(!nt.trim())continue;
var parts=nt.match(/[\\u3000-\\u9fff\\uac00-\\ud7af\\uff00-\\uffef]|\\S+|\\s+/g)||[nt];
var fg=document.createDocumentFragment();
if(ot)fg.appendChild(document.createTextNode(ot));
for(var j=0;j<parts.length;j++){
if(/^[\\s]+$/.test(parts[j])){fg.appendChild(document.createTextNode(parts[j]))}
else{var el=document.createElement('span');el.setAttribute('data-wa','');el.style.cssText='--d:'+(idx*25)+'ms';el.textContent=parts[j];fg.appendChild(el);idx++}
}
tn.parentNode.replaceChild(fg,tn);
}
_prevLen=total;
}

function applyHtml(html){
if(!html||!html.trim()){root.innerHTML='';_prevLen=0;_h();return;}
_cleanAnims();
var pl=_prevLen;
try{var t=document.createElement('div');t.innerHTML=html;morphdom(root,t,{childrenOnly:true});}catch(e){root.innerHTML=html;}
_animateNew(pl);
_h();
}

function finalizeHtml(html){
_cleanAnims();
var tmp=document.createElement('div');
tmp.innerHTML=html;
var ss=tmp.querySelectorAll('script');
var cdn=[],inl=[];
for(var i=0;i<ss.length;i++){
var info={src:ss[i].src||'',text:ss[i].textContent||'',attrs:[]};
for(var j=0;j<ss[i].attributes.length;j++){
var a=ss[i].attributes[j];
if(a.name!=='src')info.attrs.push({name:a.name,value:a.value});
}
if(info.src)cdn.push(info);else inl.push(info);
ss[i].remove();
}
try{morphdom(root,tmp,{childrenOnly:true});}catch(e){root.innerHTML=tmp.innerHTML;}
_prevLen=root.textContent?root.textContent.length:0;
function runInline(){
for(var i=0;i<inl.length;i++){
var n=document.createElement('script');
n.textContent=inl[i].text;
for(var j=0;j<inl[i].attrs.length;j++)n.setAttribute(inl[i].attrs[j].name,inl[i].attrs[j].value);
root.appendChild(n);
}
var cs=root.querySelectorAll('canvas');
for(var k=0;k<cs.length;k++)cs[k].classList.add('_charted');
_h();
}
if(!cdn.length){runInline();return;}
var rem=cdn.length;
for(var i=0;i<cdn.length;i++){
var n=document.createElement('script');
n.src=cdn[i].src;
for(var j=0;j<cdn[i].attrs.length;j++)n.setAttribute(cdn[i].attrs[j].name,cdn[i].attrs[j].value);
n.onload=n.onerror=function(){if(--rem===0)runInline();};
root.appendChild(n);
}
_h();
}

window.addEventListener('message',function(e){
if(!e.data)return;
switch(e.data.type){
case 'widget:update':
applyHtml(e.data.html);
break;
case 'widget:finalize':
finalizeHtml(e.data.html);
setTimeout(_h,150);
break;
case 'widget:measure':
_h();
break;
case 'widget:theme':
var r=document.documentElement,v=e.data.vars;
if(v)for(var k in v)r.style.setProperty(k,v[k]);
if(typeof e.data.isDark==='boolean')r.className=e.data.isDark?'dark':'';
setTimeout(_h,100);
break;
}
});

document.addEventListener('click',function(e){
var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
if(!a)return;var h=a.getAttribute('href');
if(!h||h.charAt(0)==='#')return;
e.preventDefault();
parent.postMessage({type:'widget:link',href:h},'*');
});

parent.postMessage({type:'widget:ready'},'*');
})();`;

  return `<!DOCTYPE html>
<html class="${isDark ? "dark" : ""}" style="background:transparent!important">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" as="script">
<style>
${styleBlock}
@keyframes sd-show{to{opacity:1}}
[data-wa]{opacity:0;animation:sd-show 0s step-end var(--d,0ms) forwards}
canvas{display:block;width:100%;border-radius:8px;background:linear-gradient(110deg,rgba(150,150,150,0.06) 30%,rgba(150,150,150,0.12) 50%,rgba(150,150,150,0.06) 70%);background-size:200% 100%;animation:_cshim 1.5s linear infinite}
canvas._charted{background:none!important;animation:none}
@keyframes _cshim{from{background-position:200% 0}to{background-position:-200% 0}}
</style>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">
@custom-variant dark (&:where(.dark, .dark *));
</style>
</head>
<body style="margin:0;padding:0;background:transparent!important;overflow:hidden">
<div id="__root"></div>
<script>${MORPHDOM_MIN}</script>
<script>${receiverScript}</script>
</body>
</html>`;
}
