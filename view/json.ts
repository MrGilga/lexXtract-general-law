
import { get_path, set_path } from "../model/json";
import { button, color, div, h2, h3, p, padding, popup, pre, span, style, textarea, width } from "./html";
import { validate, type Pattern } from "../model/pattern";
import type { JsonData } from "../model/types";


type Path = (string | number)[]
type View = (d:JsonData, path?: Path, onclick?: (path:Path)=>void, childView?: View)=>HTMLElement

export const jsonView : View = (d, path = [], onclick_, childView = jsonView):HTMLElement =>{

  let onclick = ()=>onclick_?.(path)
  let mkclickable = (el:HTMLElement)=>{
    el.style.cursor = "pointer"
    el.onclick = onclick
    return el
  }
  let margin = "0.2em"
  if (Array.isArray(d)){
    if (path.length == 0 && d.length == 0) return div("[]", style({color:color.gray, fontStyle:"italic", margin}))
    return div(d.map((x,i)=>{
      let el = childView(x, [...path, i], onclick_)
      el.prepend(span("• ", style({color:color.gray})))
      return mkclickable(el)
    }))
  }
  if (typeof d == "string" || typeof d == "number" || d == null) {
    return mkclickable(div(style({color: typeof d == "string" ? color.color : color.blue, margin , whiteSpace:"pre-wrap"}),
    d ? String(d) : "<empty>"
  ))
  }
  if (path.length == 0 && Object.keys(d).length == 0) return mkclickable(div("{}", style({color:color.gray, fontStyle:"italic", margin})))
  return div(...Object.entries(d).map(([k,v])=>{
    let ch = childView(v, [...path, k], onclick_)
    let toggle = button("-", {
      style:{
        background:"unset",
        border:"unset",
        cursor:"pointer",
        padding:"0",
        width:"1.1em",
        fontWeight:"bold",
        fontSize:"1.1em",
        color:color.gray,
      },
      onclick:(e:MouseEvent)=>{
      if (ch.style.display == "none"){
        ch.style.display = ""
        toggle.innerText = "-"
      }else{
        ch.style.display = "none"
        toggle.innerText = "+"
      }
      e.stopPropagation()
    }})
    ch.style.marginLeft = "1em"
    return [mkclickable(p(toggle, style({fontWeight:"bold", margin}),k,": ")), ch]
  }))
}


export const viewer = <T extends JsonData>(
  data: {
    get: ()=>T,
    set: (t:T)=>void,
    pattern: Pattern,
    onupdate?: (f:()=>void)=>void
  },
  displayfn: View = jsonView) =>{


  let el = div("loading...")
  let update = ()=>{
    el.replaceChildren(displayfn(data.get(), [], pth=>{
      console.log("path clicked", pth)
      let d = get_path(data.get(), pth) as T
      let astext = typeof d == "string"
      let newd = d
      let ta = textarea({oninput:()=>{
        ta.rows = Math.min(20, Math.max(3, ta.value.split("\n").length));

        try{

          let v = astext ? ta.value : JSON.parse(ta.value)
          newd = set_path(data.get(),pth,v) as T
          validate(data.pattern, newd)
          info.innerText = ""
        }catch(e){
          info.innerText = "Invalid JSON: "+e
        }
      }})
      ta.value = astext ? d as string : JSON.stringify(d, null, 2);
      ta.cols = 60;
      ta.rows = Math.min(20, Math.max(3, ta.value.split("\n").length));

      let info = p(style({width:"80vw", height:"5em", overflow:"auto", color:color.red}));
      let pop = popup(
        h2("Edit value"),
        h3("Path: "+pth.join(".")),
        ta,
        info,
        button("save", {onclick:()=>{data.set(newd); update(); pop.remove()}})
      )
    }))
  }

  data.onupdate?.(update)
  update()

  return el


}

