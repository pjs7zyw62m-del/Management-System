/* BLACKCELL Tube comment target routing.
 * Existing Network-post comments remain in corp_social_comments.
 * Standalone World videos and Stream videos use video-scoped comments. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function tubeCommentTarget(video){
 if(!video||typeof video!=="object")return null;
 if(typeof video.post_id==="string"&&UUID.test(video.post_id))
  return {table:"corp_social_comments",field:"post_id",id:video.post_id};
 if(typeof video.id!=="string"||!UUID.test(video.id))return null;
 if(video.bunny_stream===true)
  return {table:"corp_tube_video_comments",field:"stream_video_id",id:video.id};
 if(video.kind==="video")
  return {table:"corp_tube_video_comments",field:"asset_id",id:video.id};
 return null;
}
