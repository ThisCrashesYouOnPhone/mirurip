import { FC, useMemo } from 'react';
import styled from 'styled-components';
import { FaPlay } from 'react-icons/fa';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/swiper-bundle.css';
import { useNavigate } from 'react-router-dom';
import { SkeletonSlide, Anime } from '../../index';
import { TbCards } from 'react-icons/tb';
import { FaStar } from 'react-icons/fa';
import { FaClock } from 'react-icons/fa6';

const StyledSwiperContainer = styled(Swiper)`
  position: relative;
  max-width: 100%;
  height: 24rem;
  border-radius: var(--global-border-radius);
  cursor: grab;
  transform: translateZ(0);

  @media (max-width: 1000px) {
    height: 20rem;
  }
  @media (max-width: 500px) {
    height: 18rem;
  }
`;

const StyledSwiperSlide = styled(SwiperSlide)`
  position: relative;
  display: flex;
  justify-content: flex-start;
  align-items: center;
`;

const DarkOverlay = styled.div`
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  border-radius: var(--global-border-radius);
  z-index: 1;
  background: linear-gradient(45deg, rgba(8, 8, 8, 0.95) 0%, rgba(8, 8, 8, 0.6) 40%, transparent 80%);
`;

const SlideImageWrapper = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--global-border-radius);
`;

const SlideImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--global-border-radius);
  position: absolute;
`;

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
`;

const SlideContent = styled.div`
  position: absolute;
  left: 2rem;
  bottom: 1.5rem;
  z-index: 5;
  max-width: 60%;

  @media (max-width: 1000px) {
    left: 1rem;
    bottom: 1.5rem;
  }
`;

const SlideTitle = styled.h2`
  color: #fff;
  font-size: clamp(1.2rem, 3vw, 2.2rem);
  margin: auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (min-width: 500px) {
    white-space: nowrap;
    max-width: 100%;
  }
`;

const SlideInfo = styled.div`
  display: flex;
  gap: 0.75rem;
  color: #ffffff;
  margin: auto;
  margin-top: 0.25rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (max-width: 1000px) {
    font-size: 0.8rem;
    gap: 0.5rem;
  }
  @media (max-width: 500px) {
    font-size: 0.7rem;
    gap: 0.45rem;
  }
`;

const SlideInfoItem = styled.p`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
`;

const SlideDescription = styled.p<{
  $maxLines: boolean;
}>`
  color: #ddd;
  background: transparent;
  font-size: clamp(0.85rem, 1.3vw, 0.9rem);
  line-height: 1.3;
  max-width: 65%;
  max-height: 4.5rem;
  overflow: hidden;
  margin: 0.4rem 0 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;

  @media (max-width: 1000px) {
    max-width: 75%;
    max-height: 3rem;
    -webkit-line-clamp: 2;
  }

  @media (max-width: 500px) {
    max-width: 100%;
    max-height: 2.5rem;
    -webkit-line-clamp: 2;
  }
`;

const PlayButtonWrapper = styled.div`
  position: absolute;
  right: 2rem;
  bottom: 1.5rem;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 1000px) {
    right: 1.5rem;
    bottom: 1.5rem;
  }
`;

const PlayButton = styled.button`
  display: flex;
  gap: 0.5rem;
  background-color: var(--primary-accent, #8080cf);
  color: #fff;
  border: none;
  border-radius: var(--global-border-radius);
  font-size: 0.95rem;
  font-weight: bold;
  cursor: pointer;
  padding: 0.9rem 1.8rem;
  align-items: center;
  transition: transform 0.15s ease, filter 0.15s ease;

  &:hover,
  &:active,
  &:focus {
    filter: brightness(1.1);
    transform: scale(1.03);
  }

  @media (max-width: 1000px) {
    padding: 0.8rem 1.5rem;
  }

  @media (max-width: 500px) {
    border-radius: 50%;
    padding: 1.2rem;
    font-size: 1.1rem;
    span {
      display: none;
    }
  }
`;

const PlayIcon = styled(FaPlay)``;

const PaginationStyle = styled.div`
  .swiper-pagination-bullet {
    background: var(--global-primary-bg, #007bff);
    opacity: 0.7;
    margin: 0 3px;
  }

  .swiper-pagination-bullet-active {
    background: var(--global-text);
    opacity: 1;
  }
`;

interface HomeCarouselProps {
  data: Anime[];
  loading: boolean;
  error?: string | null;
}

export const HomeCarousel: FC<HomeCarouselProps> = ({
  data = [],
  loading,
  error,
}) => {
  const navigate = useNavigate();

  const handlePlayButtonClick = (id: string) => {
    navigate(`/watch/${id}`);
  };

  const truncateTitle = (title?: string, maxLength: number = 40): string => {
    if (!title) return 'Anime';
    return title.length > maxLength ? `${title.substring(0, maxLength)}...` : title;
  };

  const validData = useMemo(() => {
    return data.filter((item) => item && item.id && (item.title?.english || item.title?.romaji));
  }, [data]);

  return (
    <>
      {loading || error || validData.length === 0 ? (
        <SkeletonSlide />
      ) : (
        <PaginationStyle>
          <StyledSwiperContainer
            spaceBetween={30}
            slidesPerView={1}
            loop={validData.length > 1}
            autoplay={{
              delay: 5000,
              disableOnInteraction: false,
            }}
            pagination={{
              clickable: true,
              dynamicBullets: true,
            }}
            grabCursor={true}
            centeredSlides={true}
          >
            {validData.map((anime, index) => {
              const title = anime.title?.english || anime.title?.romaji || anime.title?.userPreferred || 'Anime';
              const banner = anime.cover || anime.image;
              const cleanDesc = (anime.description || '').replace(/<[^>]*>?/gm, '');

              return (
                <StyledSwiperSlide key={anime.id} title={title}>
                  <SlideImageWrapper>
                    <SlideImage
                      src={banner}
                      alt={`${title} Banner`}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      decoding='async'
                    />
                    <ContentWrapper>
                      <SlideContent>
                        <SlideTitle>{truncateTitle(title)}</SlideTitle>
                        <SlideInfo>
                          {anime.type && <SlideInfoItem>{anime.type}</SlideInfoItem>}
                          {anime.totalEpisodes ? (
                            <SlideInfoItem>
                              <TbCards />
                              {anime.totalEpisodes}
                            </SlideInfoItem>
                          ) : null}
                          {anime.rating ? (
                            <SlideInfoItem>
                              <FaStar />
                              {typeof anime.rating === 'number' ? anime.rating.toFixed(1) : anime.rating}
                            </SlideInfoItem>
                          ) : null}
                          {anime.duration ? (
                            <SlideInfoItem>
                              <FaClock />
                              {anime.duration}m
                            </SlideInfoItem>
                          ) : null}
                        </SlideInfo>
                        {cleanDesc && (
                          <SlideDescription $maxLines={cleanDesc.length > 200}>
                            {cleanDesc}
                          </SlideDescription>
                        )}
                      </SlideContent>
                      <PlayButtonWrapper>
                        <PlayButton
                          onClick={() => handlePlayButtonClick(anime.id)}
                          title={`Watch ${title} Now`}
                        >
                          <PlayIcon />
                          <span>WATCH NOW</span>
                        </PlayButton>
                      </PlayButtonWrapper>
                    </ContentWrapper>
                    <DarkOverlay />
                  </SlideImageWrapper>
                </StyledSwiperSlide>
              );
            })}
          </StyledSwiperContainer>
        </PaginationStyle>
      )}
    </>
  );
};
