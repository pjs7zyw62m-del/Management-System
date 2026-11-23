(() => {
  setTimeout(() => {
    const q=s=>document.querySelector(s);
    const r=s=>q(s).getBoundingClientRect();
    const title=r('.rr-timer-heading>strong:first-child');
    const clock=r('.rr-timer-clock');
    const money=r('.rr-timer-money');
    const heading=r('.rr-timer-heading');
    const chosen=r('.rr-timer-selected');
    const rate=r('.rr-timer-rate-label');
    const rating=r('.rr-photo-rating-title');
    const stars=r('.rr-photo-rating-buttons');
    const buttons=[...document.querySelectorAll('.rr-timer-controls>button')].map(n=>n.getBoundingClientRect());
    const stats=[...document.querySelectorAll('.rr-stat')].map(n=>n.getBoundingClientRect());
    const watch=getComputedStyle(q('.rr-timer-heading'),'::before');
    const inlineWatch=getComputedStyle(q('.rr-timer-money'),'::before');
    const timer=r('.rr-timer-panel'), review=r('#redlineLightboxReview');
    const chat=r('.rr-chat-panel'), rail=r('#rrAppleRight');
    const findings={
      'no-detached-watch':watch.content==='none'||watch.display==='none',
      'watch-next-to-money':inlineWatch.content.includes('⏱'),
      'heading-aligned':Math.abs(title.top-clock.top)<10&&money.top>title.top+9&&heading.height<=50,
      'rate-aligned':Math.abs(chosen.top-rate.top)<12,
      'buttons-balanced':Math.max(...buttons.map(n=>n.width))-Math.min(...buttons.map(n=>n.width))<6&&Math.max(...buttons.map(n=>n.top))-Math.min(...buttons.map(n=>n.top))<5,
      'rating-inline':Math.abs(rating.top-stars.top)<11,
      'compact-controls':timer.height<=160&&review.height<=82,
      'equal-stats':Math.max(...stats.map(n=>n.height))-Math.min(...stats.map(n=>n.height))<4,
      'chat-grows':chat.height>260,
      'no-overflow':timer.right<=rail.right+2&&review.right<=rail.right+2&&stats.every(n=>n.right<=rail.right+2)
    };
    Object.entries(findings).forEach(([k,v])=>document.body.setAttribute('data-'+k,String(v)));
    document.body.setAttribute('data-metrics',JSON.stringify({
      titleY:title.top,clockY:clock.top,moneyY:money.top,
      chosenY:chosen.top,rateY:rate.top,ratingY:rating.top,starsY:stars.top,
      timerH:timer.height,ratingH:review.height,chatH:chat.height,
      watch:watch.content,inlineWatch:inlineWatch.content
    }));
  },600);
})();