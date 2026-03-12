"""Graph API — returns nodes, edges, and community info for 3D visualization."""

from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..rag import get_rag

router = APIRouter(tags=["graph"])


@router.get("/graph")
async def get_graph(
    kb: str = Query(..., description="Knowledge base slug"),
    max_nodes: int = Query(2000, ge=1, le=10000),
):
    # Verify KB exists
    kb_info = await db.get_kb(kb)
    if not kb_info:
        raise HTTPException(404, "Knowledge base not found")

    rag = await get_rag(kb)

    # Get underlying NetworkX graph from the storage object
    storage = rag.chunk_entity_relation_graph
    graph = await storage._get_graph() if hasattr(storage, '_get_graph') else getattr(storage, '_graph', None)

    if graph is None or len(graph.nodes) == 0:
        return {
            "nodes": [],
            "links": [],
            "stats": {
                "node_count": 0,
                "edge_count": 0,
                "community_count": 0,
                "is_truncated": False,
            },
        }

    # Community detection (Louvain)
    community_map: dict[str, int] = {}
    community_count = 1
    try:
        import networkx as nx

        communities = nx.community.louvain_communities(
            graph.to_undirected() if graph.is_directed() else graph,
            seed=42,
        )
        for cid, members in enumerate(communities):
            for node in members:
                community_map[node] = cid
        community_count = len(communities)
    except Exception:
        # Fallback: all nodes in community 0
        for node in graph.nodes:
            community_map[node] = 0

    # Compute degree for each node
    degree_map = dict(graph.degree())

    # Filter to top max_nodes by degree
    is_truncated = len(graph.nodes) > max_nodes
    if is_truncated:
        top_nodes = sorted(degree_map, key=degree_map.get, reverse=True)[:max_nodes]
        node_set = set(top_nodes)
    else:
        node_set = set(graph.nodes)

    # Build nodes
    nodes = []
    for nid in node_set:
        attrs = graph.nodes[nid]
        nodes.append(
            {
                "id": str(nid),
                "entity_type": attrs.get("entity_type", ""),
                "description": attrs.get("description", ""),
                "community": community_map.get(nid, 0),
                "degree": degree_map.get(nid, 0),
            }
        )

    # Build links (only between visible nodes)
    links = []
    for src, tgt, attrs in graph.edges(data=True):
        if src in node_set and tgt in node_set:
            links.append(
                {
                    "source": str(src),
                    "target": str(tgt),
                    "description": attrs.get("description", ""),
                    "weight": attrs.get("weight", 1.0),
                }
            )

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(links),
            "community_count": community_count,
            "is_truncated": is_truncated,
        },
    }
